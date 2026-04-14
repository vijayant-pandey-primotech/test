import axiosInstance from "utils/axiosConfig";
import { getAuthToken } from "utils/authUtils";

const API_URL = process.env.REACT_APP_API_URL;

const getItemsList = async () => {
  const token = getAuthToken();
  const response = await axiosInstance.get(`${API_URL}/items-list`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};
const getItemById = async (itemId) => {
  const token = getAuthToken();
  const response = await axiosInstance.get(
    `${API_URL}/item-details/${itemId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};
const getPoliciesList = async (itemId) => {
  try {
    const token = getAuthToken();
    const response = await axiosInstance.get(
      `${API_URL}/policies-list/${itemId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};
const createItem = async (data) => {
  try {
    const token = getAuthToken();
    const response = await axiosInstance.post(`${API_URL}/create-item`, data, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    console.log("createItem - Success response:", response);
    return response.data;
  } catch (error) {
    console.log("createItem - Error response:", error.response);
    console.log("createItem - Error object:", error);

    // If it's a 409 conflict (duplicate), return the specific error message
    if (error.response?.status === 409) {
      console.log(
        "createItem - 409 Conflict detected, throwing:",
        error.response.data
      );
      throw error.response.data;
    }

    // For other errors, throw the error message from backend or generic message
    const errorMessage =
      error.response?.data?.message || error.message || "Failed to create item";
    console.log("createItem - Throwing error:", errorMessage);
    throw { message: errorMessage };
  }
};
const deleteItem = async (itemId) => {
  try {
    const token = getAuthToken();
    const response = await axiosInstance.delete(
      `${API_URL}/item-delete/${itemId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (error) {
    throw new Error(error.message || "Failed to delete item");
  }
};

const editItem = async (itemId, data) => {
  try {
    const token = getAuthToken();
    const response = await axiosInstance.put(
      `${API_URL}/item-edit/${itemId}`,
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

const editPolicy = async (policyId, policyIndex, data) => {
  try {
    const token = getAuthToken();
    const response = await axiosInstance.put(
      `${API_URL}/policy-edit/${policyId}/policies/${policyIndex}`,
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};
const updatePolicies = async (policyId, data, itemId) => {
  try {
    const token = getAuthToken();

    if (policyId) {
      // Update existing policies
      const response = await axiosInstance.put(
        `${API_URL}/policy-edit/${policyId}/updatePolicies`,
        data,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data;
    } else {
      // Create new policies
      const response = await axiosInstance.post(
        `${API_URL}/policy-edit/${itemId}/createPolicies`,
        data,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    }
  } catch (error) {
    throw error.response?.data || error.message;
  }
};
const deletePolicy = async (policyId, policyIndex) => {
  try {
    const token = getAuthToken();
    const response = await axiosInstance.delete(
      `${API_URL}/policy-delete/${policyId}/policies/${policyIndex}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

// Suggestions API endpoints
const getSuggestionsList = async (itemId) => {
  try {
    const token = getAuthToken();
    const response = await axiosInstance.get(
      `${API_URL}/suggestions-list/${itemId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

const deleteSuggestion = async (itemId, suggestionId) => {
  try {
    const token = getAuthToken();
    const response = await axiosInstance.delete(
      `${API_URL}/suggestion-delete/${itemId}/suggestion/${suggestionId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

const editSuggestion = async (itemId, suggestionId, suggestion) => {
  try {
    const token = getAuthToken();
    const response = await axiosInstance.put(
      `${API_URL}/suggestion-edit/${itemId}/suggestion/${suggestionId}`,
      { suggestion },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Delete a suggestion
const deleteSuggestionItem = async (itemId, suggestionId) => {
  try {
    const token = getAuthToken();
    const response = await axiosInstance.delete(
      `${API_URL}/suggestion-delete/${itemId}/suggestion/${suggestionId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    throw error;
  }
};

const updateItemSequence = async (storyId, chapterId, items) => {
  try {
    const token = getAuthToken();
    const response = await axiosInstance.put(
      `${API_URL}/update-item-sequence`,
      {
        storyId,
        chapterId,
        items,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

const getItemsByChapterId = async (chapterId) => {
  const token = getAuthToken();
  const response = await axiosInstance.get(
    `${API_URL}/items-list-by-chapter/${chapterId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

const getItemsByChapterIds = async (chapterIds) => {
  const token = getAuthToken();
  const response = await axiosInstance.post(
    `${API_URL}/items-list-by-chapters`,
    {
      chapterIds: chapterIds,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.data;
};

const getItemsFromOtherStories = async (itemRegEx, options = {}) => {
  try {
    const token = getAuthToken();
    const params = new URLSearchParams({ itemRegEx });
    if (options.onboardingOnly) params.set("onboardingOnly", "true");
    const response = await axiosInstance.get(
      `${API_URL}/items-from-other-stories?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

const itemService = {
  getItemsList,
  getItemById,
  getPoliciesList,
  createItem,
  deleteItem,
  editItem,
  editPolicy,
  updatePolicies,
  deletePolicy,
  getSuggestionsList,
  deleteSuggestion,
  editSuggestion,
  deleteSuggestionItem,
  updateItemSequence,
  getItemsByChapterId,
  getItemsByChapterIds,
  getItemsFromOtherStories,
};

export default itemService;
