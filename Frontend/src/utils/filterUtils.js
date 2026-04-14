// Utility functions for managing filter state persistence

const FILTER_STORAGE_PREFIX = 'table_filters_';
const SEQUENCE_STORAGE_PREFIX = 'sequence_mode_';

export const saveFilters = (tableName, filters) => {
  try {
    localStorage.setItem(`${FILTER_STORAGE_PREFIX}${tableName}`, JSON.stringify(filters));
  } catch (error) {
    console.error('Error saving filters:', error);
  }
};

export const loadFilters = (tableName, defaultFilters) => {
  try {
    const savedFilters = localStorage.getItem(`${FILTER_STORAGE_PREFIX}${tableName}`);
    return savedFilters ? JSON.parse(savedFilters) : defaultFilters;
  } catch (error) {
    console.error('Error loading filters:', error);
    return defaultFilters;
  }
};

export const clearFilters = (tableName) => {
  try {
    localStorage.removeItem(`${FILTER_STORAGE_PREFIX}${tableName}`);
  } catch (error) {
    console.error('Error clearing filters:', error);
  }
};

// Sequence mode state persistence functions
export const saveSequenceMode = (tableName, sequenceState) => {
  try {
    localStorage.setItem(`${SEQUENCE_STORAGE_PREFIX}${tableName}`, JSON.stringify(sequenceState));
  } catch (error) {
    console.error('Error saving sequence mode:', error);
  }
};

export const loadSequenceMode = (tableName, defaultState) => {
  try {
    const savedState = localStorage.getItem(`${SEQUENCE_STORAGE_PREFIX}${tableName}`);
    return savedState ? JSON.parse(savedState) : defaultState;
  } catch (error) {
    console.error('Error loading sequence mode:', error);
    return defaultState;
  }
};

export const clearSequenceMode = (tableName) => {
  try {
    localStorage.removeItem(`${SEQUENCE_STORAGE_PREFIX}${tableName}`);
  } catch (error) {
    console.error('Error clearing sequence mode:', error);
  }
};

export const getActiveFiltersCount = (filters) => {
  return Object.values(filters).filter(value => value && value.trim() !== '').length;
};

export const getActiveFiltersText = (filters) => {
  const activeFilters = Object.entries(filters)
    .filter(([_, value]) => value && value.trim() !== '')
    .map(([key, value]) => {
      // Convert camelCase to Title Case with spaces
      const label = key.replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase());
      return `${label}: ${value}`;
    });
  
  return activeFilters.join(', ');
};

export const getFilterPreview = (filters) => {
  const activeFilters = Object.entries(filters)
    .filter(([_, value]) => value && value.trim() !== '')
    .map(([key, value]) => {
      // Convert camelCase to Title Case with spaces
      const label = key.replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase());
      return `${label}: ${value}`;
    });

  if (activeFilters.length === 0) return null;
  
  // If there's only one filter, show it directly
  if (activeFilters.length === 1) {
    return activeFilters[0];
  }
  
  // If there are multiple filters, show the first one with a count
  return `${activeFilters[0]} (+${activeFilters.length - 1} more)`;
};

export const getFilterCountText = (filters) => {
  const count = getActiveFiltersCount(filters);
  return count > 0 ? `Applied: ${count}` : null;
}; 