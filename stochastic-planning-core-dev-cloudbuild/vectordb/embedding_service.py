import json
import psycopg2
import numpy as np
import spacy
from sentence_transformers import SentenceTransformer, CrossEncoder
from config import DB_CONFIG, EMBEDDING_MODEL, EMBEDDING_DIMENSION
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
from core.logger import log_info, log_error

class EmbeddingService:
    def __init__(self):
        """Initialize the advanced embedding service with better models"""
        # Bi-encoder for initial retrieval
        self.bi_encoder = SentenceTransformer(EMBEDDING_MODEL)
        log_info(f"Loaded bi-encoder model: {EMBEDDING_MODEL}")
        
        # Cross-encoder for re-ranking (better for semantic similarity)
        try:
            self.cross_encoder = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')
            log_info("Loaded cross-encoder model for re-ranking")
        except Exception as e:
            log_error(f"Cross-encoder not available: {e}")
            self.cross_encoder = None
        
        # Load spaCy NER model for entity extraction
        try:
            self.nlp = spacy.load("en_core_web_sm")
            log_info("Loaded spaCy NER model for entity extraction")
        except OSError:
            log_info("spaCy model not found. Installing...")
            import subprocess
            subprocess.run(["python", "-m", "spacy", "download", "en_core_web_sm"])
            self.nlp = spacy.load("en_core_web_sm")
            log_info("Loaded spaCy NER model for entity extraction")
    
    def generate_embedding(self, text):
        """Generate embedding for a given text"""
        try:
            embedding = self.bi_encoder.encode(text, convert_to_tensor=False)
            return embedding.tolist()
        except Exception as e:
            log_error(f"Error generating embedding: {e}")
            return None
    
    def generate_multi_vector_embedding(self, scenario_text, dimensions):
        """Generate multiple embeddings for different aspects of a scenario"""
        embeddings = {}
        
        # Main scenario embedding
        embeddings['scenario'] = self.generate_embedding(scenario_text)
        
        # Dimensions embedding (combined)
        if dimensions:
            dimensions_text = " ".join(dimensions)
            embeddings['dimensions'] = self.generate_embedding(dimensions_text)
        
        # Extract entities using NER
        entities = self._extract_entities(scenario_text)
        
        # Medical entities embedding
        if entities['medical']:
            medical_text = " ".join(entities['medical'])
            embeddings['medical'] = self.generate_embedding(medical_text)
        
        # Stress entities embedding
        if entities['stress']:
            stress_text = " ".join(entities['stress'])
            embeddings['stress'] = self.generate_embedding(stress_text)
        
        # General entities embedding (people, places, organizations)
        if entities['general']:
            general_text = " ".join(entities['general'])
            embeddings['general'] = self.generate_embedding(general_text)
        
        return embeddings
    
    def _extract_entities(self, text):
        """Extract entities from text using spaCy NER and linguistic features"""
        doc = self.nlp(text)
        
        # Define entity types we're interested in
        medical_entities = []
        stress_entities = []
        general_entities = []
        
        # Extract spaCy entities
        for ent in doc.ents:
            entity_text = ent.text.lower().strip()
            
            # Medical/health-related entities
            if ent.label_ in ['CONDITION', 'DISEASE', 'SYMPTOM', 'MEDICATION', 'PROCEDURE']:
                medical_entities.append(entity_text)
            # Person names (could be patients, family members)
            elif ent.label_ in ['PERSON']:
                general_entities.append(entity_text)
            # Organizations (hospitals, care facilities)
            elif ent.label_ in ['ORG']:
                general_entities.append(entity_text)
            # Locations (hospitals, care homes)
            elif ent.label_ in ['GPE', 'FAC']:
                general_entities.append(entity_text)
            # Time expressions (duration, frequency)
            elif ent.label_ in ['DATE', 'TIME']:
                general_entities.append(entity_text)
            # Numbers (ages, measurements)
            elif ent.label_ in ['CARDINAL']:
                general_entities.append(entity_text)
        
        # Extract noun phrases for additional context
        noun_phrases = [chunk.text.lower().strip() for chunk in doc.noun_chunks]
        
        # Use linguistic patterns to identify medical and stress-related content
        # Look for medical terms through dependency relationships
        for token in doc:
            # Medical terms often have specific dependency patterns
            # Look for objects of medical verbs or subjects of medical conditions
            if token.dep_ in ['dobj', 'nsubj', 'compound']:
                # Check if this token is related to medical concepts through its head
                head = token.head
                if (head.pos_ in ['VERB', 'NOUN'] and 
                    head.lemma_.lower() in ['take', 'forget', 'remember', 'miss', 'skip', 'prescribe', 'give']):
                    # This could be a medication or medical action
                    medical_entities.append(token.text.lower())
        
        # Look for emotional/stress patterns through dependency analysis
        for token in doc:
            # Emotional states often appear as adjectives or verbs
            if token.pos_ in ['ADJ', 'VERB']:
                # Check if this token has emotional connotations through its context
                # Look for words that modify or are modified by emotional terms
                for child in token.children:
                    if child.dep_ in ['advmod', 'amod'] and child.pos_ in ['ADV', 'ADJ']:
                        # This suggests an emotional state
                        stress_entities.append(token.text.lower())
                        break
        
        # Use noun phrases to capture multi-word medical and stress concepts
        for phrase in noun_phrases:
            # Check if the phrase contains medical-related words through POS analysis
            phrase_doc = self.nlp(phrase)
            has_medical_context = False
            has_stress_context = False
            
            for token in phrase_doc:
                # Medical context: look for nouns that could be medical terms
                if token.pos_ == 'NOUN' and token.dep_ in ['compound', 'nsubj', 'dobj']:
                    has_medical_context = True
                # Stress context: look for adjectives that could indicate emotional state
                elif token.pos_ == 'ADJ' and token.dep_ in ['amod', 'acomp']:
                    has_stress_context = True
            
            if has_medical_context:
                medical_entities.append(phrase)
            elif has_stress_context:
                stress_entities.append(phrase)
        
        # Remove duplicates while preserving order
        medical_entities = list(dict.fromkeys(medical_entities))
        stress_entities = list(dict.fromkeys(stress_entities))
        general_entities = list(dict.fromkeys(general_entities))
        
        return {
            'medical': medical_entities,
            'stress': stress_entities,
            'general': general_entities,
            'noun_phrases': noun_phrases
        }
    
    def load_scenarios(self, file_path="../scenarios.json"):
        """Load scenarios from JSON file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                data = json.load(file)
                return data.get('caregiving_scenarios', [])
        except Exception as e:
            log_error(f"Error loading scenarios: {e}")
            return []
    
    def insert_scenario(self, cursor, scenario_text, dimensions, embeddings, platform_id=1):
        """Insert a scenario with its multi-vector embeddings"""
        try:
            # Use the main scenario embedding for storage
            main_embedding = embeddings.get('scenario', embeddings.get('dimensions'))
            if not main_embedding:
                log_error(f"No valid embedding for scenario")
                return False
            
            # Convert to pgvector format with limited precision
            embedding_vector = "[" + ",".join(f"{x:.6f}" for x in main_embedding) + "]"
            
            insert_query = """
                INSERT INTO scenarios (scenario, dimensions, embedding, platform_id)
                VALUES (%s, %s, %s::vector, %s)
            """
            cursor.execute(insert_query, (scenario_text, dimensions, embedding_vector, platform_id))
            return True
        except Exception as e:
            log_error(f"Error inserting scenario: {e}")
            return False
    
    def process_scenarios(self):
        """Process all scenarios and insert them with multi-vector embeddings"""
        scenarios = self.load_scenarios()
        if not scenarios:
            log_info("No scenarios found to process.")
            return
        
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        try:
            log_info(f"Processing {len(scenarios)} scenarios with advanced embeddings...")
            
            for i, scenario_data in enumerate(scenarios, 1):
                scenario_text = scenario_data['scenario']
                dimensions = scenario_data['dimensions']
                
                log_info(f"Processing scenario {i}/{len(scenarios)}")
                
                # Generate multi-vector embeddings
                embeddings = self.generate_multi_vector_embedding(scenario_text, dimensions)
                if not embeddings:
                    log_error(f"Skipping scenario {i} due to embedding error")
                    continue
                
                # Insert into database
                success = self.insert_scenario(
                    cursor, scenario_text, dimensions, embeddings
                )
                
                if success:
                    log_info(f"✓ Successfully processed scenario {i}")
                else:
                    log_error(f"✗ Failed to process scenario {i}")
            
            conn.commit()
            log_info("All scenarios processed successfully!")
            
        except Exception as e:
            log_error(f"Error processing scenarios: {e}")
            conn.rollback()
        finally:
            cursor.close()
            conn.close()
    
    def search_similar_scenarios(self, query_text, limit=5, use_reranking=True, use_entity_boost=True):
        """Advanced search with multi-vector approach and semantic re-ranking"""
        try:
            # Generate query embeddings
            query_embeddings = self.generate_multi_vector_embedding(query_text, [])
            
            # Use main query embedding for initial retrieval
            query_embedding = query_embeddings.get('scenario', query_embeddings.get('dimensions'))
            if not query_embedding:
                log_error("Failed to generate query embedding")
                return []
            
            # Convert to pgvector format
            query_vector = "[" + ",".join(f"{x:.6f}" for x in query_embedding) + "]"
            
            # Extract query entities for potential boosting
            query_entities = self._extract_entities(query_text)
            log_info(f"Query entities - Medical: {len(query_entities['medical'])}, Stress: {len(query_entities['stress'])}, General: {len(query_entities['general'])}")
            
            log_info(f"Connecting to database...")
            conn = psycopg2.connect(**DB_CONFIG)
            cursor = conn.cursor()
            
            # Initial retrieval with broader limit for re-ranking
            initial_limit = limit * 3 if use_reranking and self.cross_encoder else limit
            
            log_info(f"Executing initial retrieval...")
            search_query = f"""
                SELECT id, scenario, dimensions, 
                       embedding <=> '{query_vector}'::vector as distance
                FROM scenarios 
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> '{query_vector}'::vector
                LIMIT {initial_limit}
            """

            # print(f"Search query: {search_query}")
            cursor.execute(search_query)
            
            initial_results = cursor.fetchall()
            log_info(f"Initial retrieval returned {len(initial_results)} results")
            
            if not initial_results:
                return []
            
            # Process initial results
            processed_results = [
                {
                    'id': row[0],
                    'scenario': row[1],
                    'dimensions': row[2],
                    'similarity': 1.0 - float(row[3])
                }
                for row in initial_results
            ]
            
            # Apply semantic re-ranking if cross-encoder is available
            if use_reranking and self.cross_encoder and len(processed_results) > limit:
                log_info("Applying semantic re-ranking...")
                reranked_results = self._rerank_results(query_text, processed_results, limit, query_entities, use_entity_boost)
                return reranked_results
            
            return processed_results[:limit]
            
        except Exception as e:
            log_error(f"Error searching scenarios: {e}")
            import traceback
            traceback.print_exc()
            return []
        finally:
            cursor.close()
            conn.close()
    
    def _rerank_results(self, query_text, results, limit, query_entities=None, use_entity_boost=True):
        """Re-rank results using cross-encoder and entity-based boosting"""
        try:
            # Prepare pairs for cross-encoder
            pairs = [(query_text, result['scenario']) for result in results]
            
            # Get cross-encoder scores
            scores = self.cross_encoder.predict(pairs)
            
            # Combine with original similarity scores and entity boosting
            for i, result in enumerate(results):
                # Normalize cross-encoder score to 0-1 range (they can be negative or >1)
                cross_encoder_score = float(scores[i])
                normalized_cross_score = max(0.0, min(1.0, cross_encoder_score))
                result['cross_encoder_score'] = normalized_cross_score
                
                # Calculate entity boost if enabled
                entity_boost = 0.0
                if use_entity_boost and query_entities:
                    entity_boost = self._calculate_entity_boost(query_entities, result['scenario'])
                
                # Combine scores (weighted average with entity boost)
                result['combined_score'] = 0.6 * result['similarity'] + 0.3 * normalized_cross_score + 0.1 * entity_boost
                # Ensure combined score is capped at 1.0
                result['combined_score'] = max(0.0, min(1.0, result['combined_score']))
                result['entity_boost'] = entity_boost
            
            # Sort by combined score
            reranked_results = sorted(results, key=lambda x: x['combined_score'], reverse=True)
            
            # Update similarity to combined score for display
            for result in reranked_results[:limit]:
                result['similarity'] = result['combined_score']
            
            return reranked_results[:limit]
            
        except Exception as e:
            log_error(f"Error in re-ranking: {e}")
            return results[:limit]
    
    def _calculate_entity_boost(self, query_entities, scenario_text):
        """Calculate entity-based boost score for better matching"""
        try:
            # Extract entities from scenario text
            scenario_entities = self._extract_entities(scenario_text)
            
            # Calculate overlap scores
            medical_overlap = len(set(query_entities['medical']) & set(scenario_entities['medical']))
            stress_overlap = len(set(query_entities['stress']) & set(scenario_entities['stress']))
            general_overlap = len(set(query_entities['general']) & set(scenario_entities['general']))
            
            # Weight the overlaps (medical entities are most important)
            total_boost = (medical_overlap * 0.5) + (stress_overlap * 0.3) + (general_overlap * 0.2)
            
            # Normalize to 0-1 range
            max_possible_boost = len(query_entities['medical']) * 0.5 + len(query_entities['stress']) * 0.3 + len(query_entities['general']) * 0.2
            if max_possible_boost > 0:
                normalized_boost = min(total_boost / max_possible_boost, 1.0)
            else:
                normalized_boost = 0.0
            
            return normalized_boost
            
        except Exception as e:
            log_error(f"Error calculating entity boost: {e}")
            return 0.0

if __name__ == "__main__":
    # Initialize and run the embedding service
    service = EmbeddingService()
    service.process_scenarios() 