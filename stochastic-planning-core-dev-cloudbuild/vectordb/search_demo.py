#!/usr/bin/env python3
"""
Advanced Demo script to showcase the improved vector search functionality
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
from embedding_service import EmbeddingService
from core.logger import log_info

def demo_search():
    """Interactive demo of the advanced search functionality"""
    log_info("=" * 60)
    log_info("Advanced Stochastic Planning - Vector Search Demo")
    log_info("=" * 60)
    log_info("Features: Better embedding model + Semantic re-ranking")
    
    service = EmbeddingService()
    
    log_info("\nThis demo allows you to search for similar caregiving scenarios.")
    log_info("The system uses advanced embeddings and semantic re-ranking for better results.")
    
    while True:
        log_info("\n" + "-" * 60)
        log_info("Enter your caregiving scenario (or 'quit' to exit):")
        log_info("Example: 'My grandma has Alzheimer's and doesn't recognize me anymore'")
        
        query = input("\nYour scenario: ").strip()
        
        if query.lower() in ['quit', 'exit', 'q', '0']:
            log_info("Goodbye!")
            break
        
        if not query:
            log_info("Please enter a scenario to search for.")
            continue
        
        log_info(f"\n🔍 Advanced search for scenarios similar to: '{query}'")
        log_info("-" * 60)
        
        try:
            # Use advanced search with re-ranking
            results = service.search_similar_scenarios(query, limit=5, use_reranking=True)
            
            if results:
                log_info(f"✅ Found {len(results)} similar scenarios:")
                log_info("")
                for i, result in enumerate(results, 1):
                    similarity_percent = result['similarity'] * 100
                    log_info(f"📋 Scenario #{result['id']} (Match: {similarity_percent:.1f}%)")
                    log_info(f"   {result['scenario']}")
                    log_info(f"   📊 Relevant dimensions: {', '.join(result['dimensions'][:8])}...")
                    log_info("")
            else:
                log_info("❌ No similar scenarios found.")
                
        except Exception as e:
            log_info(f"❌ Error during search: {e}")
            log_info("Please try again with a different scenario.")

if __name__ == "__main__":
    demo_search() 