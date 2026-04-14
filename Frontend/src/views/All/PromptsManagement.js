import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Container,
  Row,
  Col,
  Table,
  Button,
  Input,
  Modal,
  ModalHeader,
  ModalBody,
  Form,
  FormGroup,
  Label,
  UncontrolledDropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
  Spinner,
  Alert,
  Pagination,
  PaginationItem,
  PaginationLink,
  CardFooter,
} from "reactstrap";
import promptService from "services/promptService";
import chapterService from "services/chapterService";
import storyService from "services/storyService";
import platformService from "services/platformService";
import { Toast, useToast } from "components/Toast";

const recordsPerPage = 10;

const PromptsManagement = () => {
  const { toast, showSuccess, showError, hideToast } = useToast();

  const [promptTypes, setPromptTypes] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [stories, setStories] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  /** Table list: published-only (default) or unpublished-only drafts. */
  const [promptListFilter, setPromptListFilter] = useState("published");
  const [currentPage, setCurrentPage] = useState(1);

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [promptToEdit, setPromptToEdit] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({
    story_id: "",
    platform_ids: [],
    prompt_type_id: "",
    chapter_id: "",
    prompt_text: "",
  });
  const [chapters, setChapters] = useState([]);
  /** Stories shown in create/edit modal, filtered by selected platform */
  const [formStoryOptions, setFormStoryOptions] = useState([]);
  const [formStoriesLoading, setFormStoriesLoading] = useState(false);
  /** Editable-field baseline when opening Edit Prompt — Update stays disabled until this differs. */
  const [editInitialSnapshot, setEditInitialSnapshot] = useState(null);
  /** Same-pattern rows (all versions) for the edit modal dropdown. */
  const [patternVersions, setPatternVersions] = useState([]);
  const [patternVersionsLoading, setPatternVersionsLoading] = useState(false);
  /** Filter text for Platforms picker (search). */
  const [platformSearch, setPlatformSearch] = useState("");
  const [platformDropdownOpen, setPlatformDropdownOpen] = useState(false);
  const platformDropdownRef = useRef(null);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [lookupModalOpen, setLookupModalOpen] = useState(false);
  const [lookupRows, setLookupRows] = useState([]);
  const [lookupListLoading, setLookupListLoading] = useState(false);
  const [lookupFormOpen, setLookupFormOpen] = useState(false);
  const [lookupFormMode, setLookupFormMode] = useState("add");
  const [lookupForm, setLookupForm] = useState({
    id: null,
    prompt_function_name: "",
    display: "",
  });
  const [lookupFormLoading, setLookupFormLoading] = useState(false);
  const getErrorMessage = (errorObj) =>
    errorObj?.response?.data?.message ||
    errorObj?.response?.data?.error ||
    "Something went wrong";

  /** True if this row was ever published at least once (even if currently unpublished). */
  const isEverPublishedFlag = (p) => {
    const v =
      p?.hasEverBeenPublished ?? p?.has_been_published ?? p?.has_ever_been_published;
    return v === 1 || v === true || String(v) === "1";
  };

  const extractArray = (responseData) => {
    if (Array.isArray(responseData)) return responseData;
    if (Array.isArray(responseData?.body)) return responseData.body;
    if (Array.isArray(responseData?.data?.body)) return responseData.data.body;
    if (Array.isArray(responseData?.data)) return responseData.data;
    return [];
  };

  const loadChaptersForStory = useCallback(async (storyId) => {
    if (!storyId) {
      setChapters([]);
      return;
    }
    try {
      const res = await chapterService.getChaptersList(storyId);
      setChapters(extractArray(res));
    } catch (e) {
      if (e?.response?.status === 404) setChapters([]);
      else setChapters([]);
    }
  }, []);

  /** Which platforms include this story (via stories-by-platforms). */
  const findPlatformsContainingStory = useCallback(
    async (storyId) => {
      const sid = Number(storyId);
      if (!sid || !platforms?.length) return [];
      const checks = await Promise.all(
        platforms.map(async (p) => {
          if (p.isDeleted) return false;
          try {
            const response = await platformService.getStoriesByPlatforms([String(p.id)], false);
            const raw = response?.body ?? response?.data?.body ?? response;
            const list = Array.isArray(raw) ? raw : extractArray(raw);
            return list.some((s) => Number(s.storyId ?? s.id) === sid);
          } catch {
            return false;
          }
        })
      );
      return platforms.filter((_, i) => checks[i]);
    },
    [platforms]
  );

  const platformIdsKey = useMemo(
    () => [...(formData.platform_ids || [])].map(String).sort().join(","),
    [formData.platform_ids]
  );

  const activePlatforms = useMemo(
    () => (platforms || []).filter((p) => !p.isDeleted),
    [platforms]
  );

  const filteredPlatformsForPicker = useMemo(() => {
    const q = platformSearch.trim().toLowerCase();
    if (!q) return activePlatforms;
    return activePlatforms.filter((p) => {
      const name = (p.name || p.platformName || "").toLowerCase();
      return name.includes(q);
    });
  }, [activePlatforms, platformSearch]);

  const allFilteredSelected = useMemo(() => {
    if (!filteredPlatformsForPicker.length) return false;
    const sel = new Set(formData.platform_ids || []);
    return filteredPlatformsForPicker.every((p) => sel.has(String(p.id)));
  }, [filteredPlatformsForPicker, formData.platform_ids]);

  const platformTriggerSummary = useMemo(() => {
    const ids = formData.platform_ids || [];
    if (!ids.length) return "";
    return ids
      .map((id) => {
        const p = activePlatforms.find((x) => String(x.id) === String(id));
        return p ? p.name || p.platformName || `Platform ${id}` : String(id);
      })
      .join(", ");
  }, [formData.platform_ids, activePlatforms]);

  const selectFilteredPlatforms = useCallback(() => {
    setFormData((prev) => {
      const next = new Set(prev.platform_ids || []);
      filteredPlatformsForPicker.forEach((p) => next.add(String(p.id)));
      return {
        ...prev,
        platform_ids: [...next],
        story_id: "",
        chapter_id: "",
      };
    });
    setChapters([]);
  }, [filteredPlatformsForPicker]);

  const clearFilteredSelection = useCallback(() => {
    setFormData((prev) => {
      const drop = new Set(filteredPlatformsForPicker.map((p) => String(p.id)));
      return {
        ...prev,
        platform_ids: (prev.platform_ids || []).filter((id) => !drop.has(String(id))),
        story_id: "",
        chapter_id: "",
      };
    });
    setChapters([]);
  }, [filteredPlatformsForPicker]);

  const toggleSelectAllVisible = useCallback(() => {
    if (allFilteredSelected) {
      clearFilteredSelection();
    } else {
      selectFilteredPlatforms();
    }
  }, [allFilteredSelected, clearFilteredSelection, selectFilteredPlatforms]);

  const togglePlatformId = useCallback((rawId, checked) => {
    const id = String(rawId);
    setFormData((prev) => {
      const next = new Set(prev.platform_ids || []);
      if (checked) next.add(id);
      else next.delete(id);
      return {
        ...prev,
        platform_ids: [...next],
        story_id: "",
        chapter_id: "",
      };
    });
    setChapters([]);
  }, []);

  /** Stories for modal: all stories when no platform filter; union per platform when multi-select. */
  useEffect(() => {
    if (!formModalOpen) return;
    const ids = (formData.platform_ids || []).map(String).filter(Boolean);
    if (ids.length === 0) {
      setFormStoryOptions([]);
      setFormStoriesLoading(false);
      return;
    }

    let cancelled = false;
    setFormStoriesLoading(true);

    (async () => {
      try {
        const results = await Promise.all(
          ids.map((id) => platformService.getStoriesByPlatforms([id], false))
        );
        const merged = new Map();
        for (const response of results) {
          const raw = response?.body ?? response?.data?.body ?? response;
          const list = Array.isArray(raw) ? raw : extractArray(raw);
          for (const s of list) {
            const sid = s.storyId ?? s.id;
            if (sid != null && !merged.has(sid)) merged.set(sid, s);
          }
        }
        if (!cancelled) setFormStoryOptions([...merged.values()]);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setFormStoryOptions([]);
          showError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) setFormStoriesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [formModalOpen, platformIdsKey, stories]);

  useEffect(() => {
    if (!platformDropdownOpen) return;
    const onDocMouseDown = (e) => {
      if (platformDropdownRef.current && !platformDropdownRef.current.contains(e.target)) {
        setPlatformDropdownOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") setPlatformDropdownOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [platformDropdownOpen]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const promptParams =
        promptListFilter === "unpublished" ? { unpublished_only: true } : {};

      const [typesResult, promptsResult, storiesResult, platformsResult] = await Promise.allSettled([
        promptService.getPromptTypes(),
        promptService.getAllPrompts(promptParams),
        storyService.getStoriesList(),
        platformService.getAllPlatforms(),
      ]);

      if (typesResult.status === "fulfilled") {
        setPromptTypes(extractArray(typesResult.value));
      } else {
        throw typesResult.reason;
      }

      if (promptsResult.status === "fulfilled") {
        setPrompts(extractArray(promptsResult.value));
      } else {
        throw promptsResult.reason;
      }

      if (storiesResult.status === "fulfilled") {
        const raw = extractArray(storiesResult.value);
        setStories(Array.isArray(raw) ? raw : []);
      } else {
        setStories([]);
      }

      if (platformsResult.status === "fulfilled") {
        const pdata = platformsResult.value?.body ?? platformsResult.value?.data ?? platformsResult.value;
        setPlatforms(Array.isArray(pdata) ? pdata : extractArray(pdata));
      } else {
        setPlatforms([]);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [promptListFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const storyNameById = useCallback(
    (storyId) => {
      const sid = Number(storyId);
      const match = stories.find((s) => Number(s.storyId ?? s.id) === sid);
      return match?.storyName || match?.name || (storyId != null ? String(storyId) : "—");
    },
    [stories]
  );

  const platformLabel = useCallback(
    (platformId) => {
      if (platformId == null || platformId === "" || Number(platformId) === 0) {
        return "All platforms";
      }
      const pid = Number(platformId);
      const match = platforms.find((p) => Number(p.id) === pid);
      return match
        ? String(match.name || match.platformName || "Platform").trim() || `Platform ${pid}`
        : String(platformId);
    },
    [platforms]
  );

  const platformLabelsForPrompt = useCallback(
    (prompt) => {
      let ids = prompt.platformIds ?? prompt.platform_ids;
      if (typeof ids === "string") {
        try {
          ids = JSON.parse(ids);
        } catch {
          ids = null;
        }
      }
      if (Array.isArray(ids) && ids.length > 0) {
        return ids.map((id) => platformLabel(id)).join(", ");
      }
      return platformLabel(prompt.platformId ?? prompt.platform_id);
    },
    [platformLabel]
  );

  const chapterNameById = useCallback(
    (chapterId, storyIdForLookup) => {
      if (!chapterId) return "All Chapters";
      const match = chapters.find(
        (c) =>
          Number(c.chapterId ?? c.chapter_id) === Number(chapterId) &&
          (!storyIdForLookup || Number(c.storyId ?? c.story_id) === Number(storyIdForLookup))
      );
      if (match) return match.chapterName || match.chapter_name || String(chapterId);
      return String(chapterId);
    },
    [chapters]
  );

  const editFormIsDirty = useMemo(() => {
    if (!promptToEdit || !editInitialSnapshot) return false;
    const s = editInitialSnapshot;
    return (
      String(formData.chapter_id ?? "") !== String(s.chapter_id ?? "") ||
      String(formData.prompt_type_id ?? "") !== String(s.prompt_type_id ?? "") ||
      (formData.prompt_text || "") !== (s.prompt_text || "")
    );
  }, [promptToEdit, editInitialSnapshot, formData.chapter_id, formData.prompt_type_id, formData.prompt_text]);

  const storySelectOptions = useMemo(() => {
    const sid = formData.story_id ? Number(formData.story_id) : null;
    const base = formStoryOptions || [];
    if (!sid || !promptToEdit) return base;
    const has = base.some((s) => Number(s.storyId ?? s.id) === sid);
    if (has) return base;
    const name =
      promptToEdit.story?.storyName ||
      storyNameById(sid) ||
      `Story ${sid}`;
    return [...base, { storyId: sid, storyName: name }];
  }, [formStoryOptions, formData.story_id, promptToEdit, storyNameById]);

  const filteredPrompts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const newestFirst = (a, b) => Number(b.id || 0) - Number(a.id || 0);
    if (!q) return [...prompts].sort(newestFirst);
    return prompts.filter((p) => {
      const idStr = String(p.id ?? "");
      let ids = p.platformIds ?? p.platform_ids;
      if (typeof ids === "string") {
        try {
          ids = JSON.parse(ids);
        } catch {
          ids = null;
        }
      }
      const plat = Array.isArray(ids) && ids.length
        ? ids.map(String).join(" ")
        : String(p.platformId ?? p.platform_id ?? "");
      const story = storyNameById(p.storyId ?? p.story_id).toLowerCase();
      const disp = String(
        p.promptTypeDisplay || p.promptFunctionName || p.prompt_type_id || ""
      ).toLowerCase();
      const ch = chapterNameById(p.chapterId ?? p.chapter_id, p.storyId).toLowerCase();
      return (
        idStr.includes(q) ||
        plat.includes(q) ||
        story.includes(q) ||
        disp.includes(q) ||
        ch.includes(q)
      );
    }).sort(newestFirst);
  }, [prompts, searchTerm, storyNameById, chapterNameById]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, prompts.length, promptListFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredPrompts.length / recordsPerPage));
  const safePage = Math.min(currentPage, pageCount);
  const pagedPrompts = useMemo(() => {
    const start = (safePage - 1) * recordsPerPage;
    return filteredPrompts.slice(start, start + recordsPerPage);
  }, [filteredPrompts, safePage]);

  const openCreateModal = () => {
    setPromptToEdit(null);
    setEditInitialSnapshot(null);
    setPlatformSearch("");
    setPlatformDropdownOpen(false);
    setChapters([]);
    setFormData({
      story_id: "",
      platform_ids: [],
      prompt_type_id:
        promptTypes[0]?.id != null ? String(promptTypes[0].id) : "",
      chapter_id: "",
      prompt_text: "",
    });
    setFormModalOpen(true);
  };

  const hydrateEditFormFromPrompt = useCallback(
    async (prompt) => {
      setPromptToEdit(prompt);
      const sid = prompt.storyId ?? prompt.story_id;
      await loadChaptersForStory(sid);
      let platformIds = [];
      let rawIds = prompt.platformIds ?? prompt.platform_ids;
      if (typeof rawIds === "string") {
        try {
          rawIds = JSON.parse(rawIds);
        } catch {
          rawIds = null;
        }
      }
      if (Array.isArray(rawIds) && rawIds.length > 0) {
        platformIds = rawIds.map((x) => String(x));
      } else {
        platformIds = (platforms || [])
          .filter((p) => !p.isDeleted)
          .map((p) => String(p.id));
      }
      setFormData({
        story_id: sid ?? "",
        platform_ids: platformIds,
        prompt_type_id:
          prompt.promptTypeId != null && prompt.promptTypeId !== ""
            ? String(prompt.promptTypeId)
            : "",
        chapter_id:
          prompt.chapterId != null && prompt.chapterId !== ""
            ? String(prompt.chapterId)
            : "",
        prompt_text: prompt.promptText || prompt.prompt_text || "",
      });
      setEditInitialSnapshot({
        chapter_id:
          prompt.chapterId != null && prompt.chapterId !== ""
            ? String(prompt.chapterId)
            : "",
        prompt_type_id:
          prompt.promptTypeId != null && prompt.promptTypeId !== ""
            ? String(prompt.promptTypeId)
            : "",
        prompt_text: prompt.promptText || prompt.prompt_text || "",
      });
    },
    [loadChaptersForStory, platforms]
  );

  const openEditModal = async (prompt) => {
    setPlatformSearch("");
    setPlatformDropdownOpen(false);
    setPatternVersionsLoading(true);
    try {
      const vres = await promptService.getPromptVersions(prompt.id);
      setPatternVersions(extractArray(vres.body ?? vres));
    } catch (err) {
      showError(getErrorMessage(err));
      setPatternVersions([prompt]);
    } finally {
      setPatternVersionsLoading(false);
    }
    await hydrateEditFormFromPrompt(prompt);
    setFormModalOpen(true);
  };

  const switchEditPromptVersion = async (newId) => {
    const target = patternVersions.find((p) => Number(p.id) === Number(newId));
    if (!target || Number(promptToEdit?.id) === Number(newId)) return;
    if (editFormIsDirty) {
      const ok = window.confirm(
        "You have unsaved edits. Switch version without saving?"
      );
      if (!ok) return;
    }
    setFormLoading(true);
    try {
      await hydrateEditFormFromPrompt(target);
      const vres = await promptService.getPromptVersions(newId);
      setPatternVersions(extractArray(vres.body ?? vres));
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setFormLoading(false);
    }
  };

  const closeFormModal = () => {
    setFormModalOpen(false);
    setPlatformSearch("");
    setPlatformDropdownOpen(false);
    setPatternVersions([]);
    setEditInitialSnapshot(null);
    setPromptToEdit(null);
    setChapters([]);
    setFormStoryOptions([]);
    setFormData({
      story_id: "",
      platform_ids: [],
      prompt_type_id: "",
      chapter_id: "",
      prompt_text: "",
    });
  };

  const handleFormSubmit = async () => {
    if (!formData.prompt_type_id) {
      showError("Prompt type is required");
      return;
    }
    if (!formData.prompt_text.trim()) {
      showError("Prompt text is required");
      return;
    }

    const platIds = (formData.platform_ids || [])
      .map((x) => Number(x))
      .filter((n) => !Number.isNaN(n) && n > 0);
    if (!promptToEdit && platIds.length === 0) {
      showError("Select at least one platform");
      return;
    }
    const payload = {
      prompt_type_id: Number(formData.prompt_type_id),
      prompt_text: formData.prompt_text,
      ...(formData.chapter_id ? { chapter_id: Number(formData.chapter_id) } : {}),
    };
    if (platIds.length > 0) {
      payload.platform_ids = platIds;
    } else {
      payload.platform_id = null;
    }

    try {
      setFormLoading(true);
      if (promptToEdit) {
        const response = await promptService.updatePrompt(promptToEdit.id, payload);
        if (response && (response.status === 200 || response.status === 201)) {
          showSuccess(
            response.message && String(response.message).trim()
              ? response.message
              : "Prompt updated successfully"
          );
          closeFormModal();
          await loadData();
        } else {
          showError(response?.message || "Failed to update prompt");
        }
      } else {
        payload.story_id = formData.story_id ? Number(formData.story_id) : null;
        const response = await promptService.createPrompt(payload);
        if (response && (response.status === 200 || response.status === 201)) {
          showSuccess("Prompt created successfully");
          closeFormModal();
          await loadData();
        } else {
          showError(response?.message || "Failed to create prompt");
        }
      }
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setFormLoading(false);
    }
  };

  const openConfirm = (action, prompt) => {
    setConfirmAction(action);
    setConfirmTarget(prompt);
    setConfirmModalOpen(true);
  };

  const closeConfirm = () => {
    setConfirmModalOpen(false);
    setConfirmAction(null);
    setConfirmTarget(null);
  };

  const getConfirmText = () => {
    if (confirmAction === "publish") return "Are you sure you want to publish this prompt?, Publishing this will Unpublish the other version";
    if (confirmAction === "unpublish") return "Are you sure you want to unpublish this prompt?";
    if (confirmAction === "delete") return "Are you sure you want to delete this prompt?";
    return "Are you sure?";
  };

  const openPromptTypeLookupModal = async () => {
    setLookupModalOpen(true);
    setLookupListLoading(true);
    try {
      const res = await promptService.getPromptTypeLookupList();
      setLookupRows(extractArray(res));
    } catch (err) {
      showError(getErrorMessage(err));
      setLookupModalOpen(false);
    } finally {
      setLookupListLoading(false);
    }
  };

  const openLookupAddForm = () => {
    setLookupFormMode("add");
    setLookupForm({ id: null, prompt_function_name: "", display: "" });
    setLookupFormOpen(true);
  };

  const openLookupEditForm = (row) => {
    setLookupFormMode("edit");
    setLookupForm({
      id: row.id,
      prompt_function_name: row.promptFunctionName || row.prompt_function_name || "",
      display: row.display ?? "",
    });
    setLookupFormOpen(true);
  };

  const closeLookupForm = () => {
    setLookupFormOpen(false);
    setLookupForm({ id: null, prompt_function_name: "", display: "" });
  };

  const submitLookupForm = async () => {
    const name = lookupForm.prompt_function_name.trim();
    if (!name) {
      showError("Function name is required");
      return;
    }
    const payload = {
      prompt_function_name: name,
      display: lookupForm.display.trim() ? lookupForm.display.trim() : null,
    };
    try {
      setLookupFormLoading(true);
      let response = null;
      if (lookupFormMode === "add") {
        response = await promptService.createPromptTypeLookup(payload);
      } else {
        response = await promptService.updatePromptTypeLookup(lookupForm.id, payload);
      }
      if (response && (response.status === 200 || response.status === 201)) {
        showSuccess(lookupFormMode === "add" ? "Prompt type created" : "Prompt type updated");
        closeLookupForm();
        const listRes = await promptService.getPromptTypeLookupList();
        setLookupRows(extractArray(listRes));
        await loadData();
      } else {
        showError(response?.message || "Request failed");
      }
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setLookupFormLoading(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction || !confirmTarget) return;

    try {
      setActionLoading(true);
      let response = null;
      if (confirmAction === "publish") {
        response = await promptService.updatePromptPublishStatus(confirmTarget.id, 1);
      } else if (confirmAction === "unpublish") {
        response = await promptService.updatePromptPublishStatus(confirmTarget.id, 0);
      } else if (confirmAction === "delete") {
        response = await promptService.deletePrompt(confirmTarget.id);
      }

      if (response && (response.status === 200 || response.status === 201)) {
        showSuccess(
          confirmAction === "publish"
            ? "Prompt published successfully"
            : confirmAction === "unpublish"
            ? "Prompt unpublished successfully"
            : "Prompt deleted successfully"
        );
        const closedModalDelete =
          confirmAction === "delete" &&
          formModalOpen &&
          promptToEdit &&
          Number(confirmTarget.id) === Number(promptToEdit.id);
        if (closedModalDelete) {
          closeFormModal();
        }
        closeConfirm();
        await loadData();
        if (
          !closedModalDelete &&
          (confirmAction === "publish" || confirmAction === "unpublish") &&
          formModalOpen
        ) {
          const pid = confirmTarget.id;
          try {
            const vres = await promptService.getPromptVersions(pid);
            const list = extractArray(vres.body ?? vres);
            setPatternVersions(list);
            const cur = list.find((p) => Number(p.id) === Number(pid));
            if (cur) {
              setPromptToEdit(cur);
              setEditInitialSnapshot({
                chapter_id:
                  cur.chapterId != null && cur.chapterId !== ""
                    ? String(cur.chapterId)
                    : "",
                prompt_type_id:
                  cur.promptTypeId != null && cur.promptTypeId !== ""
                    ? String(cur.promptTypeId)
                    : "",
                prompt_text: cur.promptText || cur.prompt_text || "",
              });
            }
          } catch (_) {
            /* ignore */
          }
        }
      } else {
        showError(response?.message || "Action failed");
      }
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const tableStyles = {
    th: {
      whiteSpace: "normal",
      padding: "8px 4px",
      textAlign: "center",
      fontSize: "0.75rem",
      fontWeight: "600",
      textTransform: "uppercase",
    },
    td: {
      whiteSpace: "normal",
      padding: "8px 4px",
      textAlign: "center",
      fontSize: "0.875rem",
      wordBreak: "break-word",
    },
  };

  const publishStatusPillStyle = (isPublished) => ({
    display: "inline-block",
    padding: "5px 14px",
    borderRadius: "999px",
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    lineHeight: 1.25,
    ...(isPublished
      ? { backgroundColor: "#d1fae5", color: "#059669" }
      : { backgroundColor: "#fee2e2", color: "#dc2626" }),
  });

  const promptTypeOptionLabel = (typeObj) => {
    if (typeof typeObj === "string") return typeObj;
    return (
      typeObj.display ||
      typeObj.promptFunctionName ||
      typeObj.prompt_function_name ||
      typeObj.name ||
      ""
    );
  };

  const promptTypeOptionValue = (typeObj) => {
    if (typeof typeObj === "string") return typeObj;
    if (typeObj?.id != null) return String(typeObj.id);
    return typeObj.promptFunctionName || typeObj.prompt_function_name || typeObj.value || "";
  };

  if (loading) {
    return (
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: "1.25rem" }}>
              PROMPTS MANAGEMENT
            </h3>
            <Card className="shadow">
              <CardBody className="text-center py-5">
                <Spinner color="primary" />
                <p className="mt-3 text-muted">Loading prompts...</p>
              </CardBody>
            </Card>
          </div>
        </Row>
      </Container>
    );
  }

  if (error) {
    return (
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: "1.25rem" }}>
              PROMPTS MANAGEMENT
            </h3>
            <Alert color="danger">
              <h4 className="alert-heading">Error Loading Prompts</h4>
              <p>{error}</p>
              <hr />
              <Button color="danger" onClick={loadData}>
                Try Again
              </Button>
            </Alert>
          </div>
        </Row>
      </Container>
    );
  }

  return (
    <>
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: "1.25rem" }}>
              PROMPTS MANAGEMENT
            </h3>
            <Card className="shadow">
              <CardHeader className="border-0">
                <Row className="align-items-center">
                  <Col lg="4" md="12" className="mb-2 mb-lg-0">
                    <div
                      className="d-flex align-items-center"
                      style={{ gap: "8px", overflowX: "hidden", whiteSpace: "nowrap" }}
                    >
                      <Button
                        type="button"
                        onClick={() => setPromptListFilter("published")}
                        style={{
                          backgroundColor:
                            promptListFilter === "published" ? "#ffffff" : "#f8fafc",
                          borderBottom:
                            promptListFilter === "published"
                              ? "3px solid #1f2937"
                              : "1px solid #98a2b3",
                          borderTop: "0",
                          borderLeft:
                            promptListFilter === "published" ? "1px solid #d7dde4" : "0",
                          borderRight:
                            promptListFilter === "published" ? "1px solid #d7dde4" : "0",
                          borderRadius: "0.6rem",
                          color: "#344054",
                          fontWeight: 600,
                          boxShadow:
                            promptListFilter === "published"
                              ? "0 1px 2px rgba(16,24,40,0.12)"
                              : "none",
                          padding: "0.45rem 1rem",
                        }}
                        className="text-nowrap"
                      >
                        Published
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setPromptListFilter("unpublished")}
                        style={{
                          backgroundColor:
                            promptListFilter === "unpublished" ? "#ffffff" : "#f8fafc",
                          borderBottom:
                            promptListFilter === "unpublished"
                              ? "3px solid #1f2937"
                              : "1px solid #98a2b3",
                          borderTop: "0",
                          borderLeft:
                            promptListFilter === "unpublished" ? "1px solid #d7dde4" : "0",
                          borderRight:
                            promptListFilter === "unpublished" ? "1px solid #d7dde4" : "0",
                          borderRadius: "0.6rem",
                          color: "#344054",
                          fontWeight: 600,
                          boxShadow:
                            promptListFilter === "unpublished"
                              ? "0 1px 2px rgba(16,24,40,0.12)"
                              : "none",
                          padding: "0.45rem 1rem",
                        }}
                        className="text-nowrap"
                      >
                        Unpublished
                      </Button>
                    </div>
                  </Col>
                  <Col lg="4" md="12" className="mb-2 mb-lg-0">
                    <div
                      className="d-flex flex-nowrap justify-content-center align-items-center"
                      style={{ gap: "8px", overflowX: "hidden", whiteSpace: "nowrap" }}
                    >
                      <Button
                        color="secondary"
                        outline
                        size="sm"
                        type="button"
                        className="text-nowrap"
                        onClick={openPromptTypeLookupModal}
                      >
                        <i className="fas fa-tags mr-1"></i>
                        Add/Edit prompt_type
                      </Button>
                      <Button
                        style={{
                          backgroundColor: "#3A6D8C",
                          borderColor: "#3A6D8C",
                          color: "white",
                        }}
                        size="sm"
                        type="button"
                        onClick={openCreateModal}
                      >
                        <i className="fas fa-plus mr-1"></i>
                        Add New Prompt
                      </Button>
                    </div>
                  </Col>
                  <Col lg="4" md="12">
                    <div className="d-flex justify-content-lg-end justify-content-start">
                      <Input
                        type="search"
                        placeholder="Search prompts..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="form-control-alternative"
                        style={{ minWidth: "180px", maxWidth: "320px" }}
                      />
                    </div>
                  </Col>
                </Row>
              </CardHeader>
              <CardBody className="px-0 pt-0 pb-2">
                <div className="table-responsive">
                  <Table className="align-items-center table-flush mb-0">
                    <thead className="thead-light">
                      <tr>
                        <th className="text-center" style={tableStyles.th}>
                          ID
                        </th>
                        <th className="text-center" style={tableStyles.th}>
                          Platform
                        </th>
                        <th className="text-center" style={tableStyles.th}>
                          Story
                        </th>
                        <th className="text-center" style={tableStyles.th}>
                          Chapter
                        </th>
                        <th className="text-center" style={tableStyles.th}>
                          Prompt Type
                        </th>
                        <th className="text-center" style={tableStyles.th}>
                          Version
                        </th>
                        <th className="text-center" style={tableStyles.th}>
                          Is Published
                        </th>
                        <th className="text-center" style={tableStyles.th}>
                          Updated At
                        </th>
                        <th className="text-center" style={tableStyles.th}>
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedPrompts.map((prompt) => (
                        <tr key={prompt.id}>
                          <td className="text-center" style={tableStyles.td}>
                            {prompt.id}
                          </td>
                          <td className="text-center" style={tableStyles.td}>
                            {platformLabelsForPrompt(prompt)}
                          </td>
                          <td className="text-center" style={tableStyles.td}>
                            {prompt.story?.storyName || storyNameById(prompt.storyId ?? prompt.story_id)}
                          </td>
                          <td className="text-center" style={tableStyles.td}>
                            {prompt.chapter?.chapterName ||
                              chapterNameById(
                                prompt.chapterId ?? prompt.chapter_id,
                                prompt.storyId ?? prompt.story_id
                              )}
                          </td>
                          <td className="text-center" style={tableStyles.td}>
                            {prompt.promptTypeDisplay ||
                              prompt.promptTypeLookup?.display ||
                              prompt.display ||
                              "—"}
                          </td>
                          <td className="text-center" style={tableStyles.td}>
                            {prompt.version ?? "—"}
                          </td>
                          <td className="text-center" style={tableStyles.td}>
                            <span
                              style={publishStatusPillStyle(
                                !!(prompt.isPublished ?? prompt.is_published)
                              )}
                            >
                              {(prompt.isPublished ?? prompt.is_published)
                                ? "Published"
                                : "Unpublished"}
                            </span>
                          </td>
                          <td className="text-center" style={tableStyles.td}>
                            {(prompt.updatedAt || prompt.updated_at)
                              ? new Date(prompt.updatedAt || prompt.updated_at).toLocaleString("en-US")
                              : "—"}
                          </td>
                          <td className="text-center" style={tableStyles.td}>
                            <UncontrolledDropdown>
                              <DropdownToggle
                                className="btn btn-sm btn-outline-secondary"
                                href="#pablo"
                                role="button"
                                size="sm"
                                onClick={(e) => e.preventDefault()}
                              >
                                <i className="fas fa-ellipsis-v" />
                              </DropdownToggle>
                              <DropdownMenu className="dropdown-menu-arrow" right container="body">
                                <DropdownItem
                                  href="#pablo"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    openEditModal(prompt);
                                  }}
                                >
                                  <i className="fas fa-edit mr-2" style={{ color: "#3A6D8C" }} />
                                  Edit
                                </DropdownItem>
                                <DropdownItem
                                  href="#pablo"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    openConfirm(
                                      (prompt.isPublished ?? prompt.is_published) ? "unpublish" : "publish",
                                      prompt
                                    );
                                  }}
                                  style={{
                                    ...(prompt.isPublished ?? prompt.is_published)
                                      ? { color: "#dc2626" }
                                      : { color: "#059669" },
                                  }}
                                >
                                  <i
                                    className="fas fa-bullhorn mr-2"
                                    style={{
                                      color: (prompt.isPublished ?? prompt.is_published)
                                        ? "#dc2626"
                                        : "#059669",
                                    }}
                                  />
                                  {(prompt.isPublished ?? prompt.is_published) ? "Unpublish" : "Publish"}
                                </DropdownItem>
                                <DropdownItem
                                  href="#pablo"
                                  disabled={isEverPublishedFlag(prompt)}
                                  title={
                                    isEverPublishedFlag(prompt)
                                      ? "Cannot delete a version that has been published before"
                                      : undefined
                                  }
                                  onClick={(e) => {
                                    e.preventDefault();
                                    if (isEverPublishedFlag(prompt)) return;
                                    openConfirm("delete", prompt);
                                  }}
                                  style={{
                                    color: "#dc3545",
                                    opacity: isEverPublishedFlag(prompt) ? 0.5 : 1,
                                    cursor: isEverPublishedFlag(prompt) ? "not-allowed" : "pointer",
                                  }}
                                >
                                  <i className="fas fa-trash mr-2" style={{ color: "#dc3545" }} />
                                  Delete
                                </DropdownItem>
                              </DropdownMenu>
                            </UncontrolledDropdown>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>

                {filteredPrompts.length === 0 && (
                  <div className="text-center py-5">
                    <i className="fas fa-comment-dots fa-3x text-muted mb-3"></i>
                    <h5 className="text-muted">No prompts found</h5>
                  </div>
                )}
              </CardBody>
              {filteredPrompts.length > 0 && (
                <CardFooter className="py-3 d-flex justify-content-between align-items-center flex-wrap">
                  <div className="text-muted small">
                    Showing {(safePage - 1) * recordsPerPage + 1} to{" "}
                    {Math.min(safePage * recordsPerPage, filteredPrompts.length)} of{" "}
                    {filteredPrompts.length} entries
                  </div>
                  <Pagination className="pagination justify-content-end mb-0">
                    <PaginationItem disabled={safePage <= 1}>
                      <PaginationLink
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setCurrentPage((p) => Math.max(1, p - 1));
                        }}
                      >
                        <i className="fas fa-angle-left" />
                      </PaginationLink>
                    </PaginationItem>
                    {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => (
                      <PaginationItem key={page} active={page === safePage}>
                        <PaginationLink
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            setCurrentPage(page);
                          }}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem disabled={safePage >= pageCount}>
                      <PaginationLink
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setCurrentPage((p) => Math.min(pageCount, p + 1));
                        }}
                      >
                        <i className="fas fa-angle-right" />
                      </PaginationLink>
                    </PaginationItem>
                  </Pagination>
                </CardFooter>
              )}
            </Card>
          </div>
        </Row>
      </Container>

      <Modal isOpen={formModalOpen} toggle={closeFormModal} centered size="lg">
        <ModalHeader className="border-0 pb-0" toggle={closeFormModal}>
          {promptToEdit ? "Edit Prompt" : "Create Prompt"}
        </ModalHeader>
        <ModalBody className="pt-0">
          <Form>
            <FormGroup className="mb-4">
              <Label className="d-block mb-2" style={{ fontWeight: 600, color: "#32325d" }}>
                Platforms <span className="text-danger">*</span>
              </Label>

              {activePlatforms.length === 0 ? (
                <div
                  className="rounded py-4 px-3 text-center text-muted small"
                  style={{
                    border: "1px dashed #cbd5e0",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  {platforms?.length === 0
                    ? "No platforms loaded. Refresh the page or check your connection."
                    : "No active platforms."}
                </div>
              ) : promptToEdit ? (
                <div
                  className="rounded d-flex align-items-center px-3 py-2"
                  style={{
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#f8fafc",
                    minHeight: "42px",
                    color: "#475569",
                  }}
                >
                  <span style={{ fontSize: "0.9rem" }}>
                    {platformTriggerSummary || "—"}
                  </span>
                </div>
              ) : (
                <div ref={platformDropdownRef} className="position-relative">
                  <button
                    type="button"
                    className="w-100 d-flex align-items-center justify-content-between rounded border px-3 py-2 bg-white text-left"
                    style={{
                      borderColor: "#cbd5e1",
                      minHeight: "42px",
                      boxShadow: "none",
                    }}
                    onClick={() => setPlatformDropdownOpen((o) => !o)}
                    aria-expanded={platformDropdownOpen}
                    aria-haspopup="listbox"
                  >
                    <span
                      className={platformTriggerSummary ? "text-dark" : "text-muted"}
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                        fontSize: "0.9rem",
                      }}
                    >
                      {platformTriggerSummary || "Select platforms (required)"}
                    </span>
                    <i
                      className="fas fa-chevron-down ml-2"
                      style={{
                        flexShrink: 0,
                        color: "#64748b",
                        fontSize: "0.75rem",
                        transform: platformDropdownOpen ? "rotate(180deg)" : "none",
                        transition: "transform 0.2s ease",
                      }}
                      aria-hidden
                    />
                  </button>

                  {platformDropdownOpen && (
                    <div
                      className="rounded border bg-white position-absolute w-100 mt-1"
                      style={{
                        zIndex: 2000,
                        boxShadow: "0 0.5rem 1rem rgba(0, 0, 0, 0.12)",
                        maxHeight: "min(360px, 50vh)",
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                        borderColor: "#e2e8f0",
                      }}
                    >
                      <div className="p-2 border-bottom" style={{ borderColor: "#e2e8f0" }}>
                        <Input
                          type="text"
                          bsSize="sm"
                          placeholder="Search"
                          value={platformSearch}
                          onChange={(e) => setPlatformSearch(e.target.value)}
                          className="form-control-alternative"
                          style={{ borderColor: "#e2e8f0" }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      {filteredPlatformsForPicker.length > 0 && (
                        <div
                          className="px-3 py-2 border-bottom d-flex align-items-center"
                          style={{ borderColor: "#e2e8f0" }}
                        >
                          <input
                            type="checkbox"
                            className="mr-2"
                            id="platform-select-all-visible"
                            checked={allFilteredSelected}
                            onChange={toggleSelectAllVisible}
                            style={{
                              width: "16px",
                              height: "16px",
                              accentColor: "#3A6D8C",
                              cursor: "pointer",
                              flexShrink: 0,
                            }}
                          />
                          <label
                            htmlFor="platform-select-all-visible"
                            className="mb-0"
                            style={{
                              fontSize: "0.875rem",
                              color: "#1e293b",
                              fontWeight: 500,
                              cursor: "pointer",
                            }}
                          >
                            Select all
                          </label>
                        </div>
                      )}
                      <div
                        className="overflow-auto flex-grow-1"
                        style={{ maxHeight: "min(260px, 40vh)" }}
                      >
                        {filteredPlatformsForPicker.length === 0 ? (
                          <div className="text-muted small text-center py-3 px-2">
                            {platformSearch.trim()
                              ? "No platforms match your search."
                              : "No platforms to show."}
                          </div>
                        ) : (
                          filteredPlatformsForPicker.map((p) => {
                            const pid = String(p.id);
                            const checked = (formData.platform_ids || []).includes(pid);
                            const label = p.name || p.platformName || `Platform ${p.id}`;
                            return (
                              <label
                                key={p.id}
                                className="d-flex align-items-center mb-0 px-3 py-2 border-bottom"
                                style={{
                                  borderColor: "#f1f5f9",
                                  cursor: "pointer",
                                  userSelect: "none",
                                }}
                                htmlFor={`prompt-platform-dd-${p.id}`}
                              >
                                <input
                                  className="mr-2"
                                  id={`prompt-platform-dd-${p.id}`}
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    togglePlatformId(p.id, e.target.checked)
                                  }
                                  style={{
                                    width: "16px",
                                    height: "16px",
                                    accentColor: "#3A6D8C",
                                    cursor: "pointer",
                                    flexShrink: 0,
                                  }}
                                />
                                <span
                                  style={{
                                    fontSize: "0.875rem",
                                    fontWeight: 600,
                                    color: "#1e293b",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.02em",
                                  }}
                                >
                                  {label}
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!promptToEdit && (
                <small className="text-muted d-block mt-2" style={{ fontSize: "0.8rem" }}>
                  Nothing is selected by default. Open the dropdown and choose at least one platform
                  (required). Use Search to filter. Your selection determines which stories appear
                  below.
                </small>
              )}
              {promptToEdit && (
                <small className="text-muted d-block mt-2" style={{ fontSize: "0.8rem" }}>
                  Platform and story cannot be changed when editing.
                </small>
              )}
            </FormGroup>
            <FormGroup>
              <Label for="storyId">
                Story (optional)
                {formStoriesLoading && (
                  <Spinner size="sm" color="primary" className="ml-2" />
                )}
              </Label>
              <Input
                type="select"
                id="storyId"
                value={String(formData.story_id ?? "")}
                onChange={async (e) => {
                  const v = e.target.value;
                  setFormData((prev) => ({ ...prev, story_id: v, chapter_id: "" }));
                  await loadChaptersForStory(v);
                  if (promptToEdit || !v) return;
                  const matched = await findPlatformsContainingStory(v);
                  if (!matched.length) return;
                  setFormData((prev) => {
                    if (String(prev.story_id) !== String(v)) return prev;
                    const allIds = (platforms || [])
                      .filter((p) => !p.isDeleted)
                      .map((p) => String(p.id));
                    const allKey = [...allIds].sort().join(",");
                    const curKey = [...(prev.platform_ids || [])].map(String).sort().join(",");
                    const treatAsAllScope = curKey === allKey;
                    if (!treatAsAllScope) return prev;
                    return {
                      ...prev,
                      platform_ids: matched.map((p) => String(p.id)),
                    };
                  });
                }}
                className="form-control-alternative"
                disabled={
                  formStoriesLoading ||
                  !!promptToEdit ||
                  (!promptToEdit && !(formData.platform_ids || []).length)
                }
              >
                <option value="">
                  {formStoriesLoading
                    ? "Loading stories…"
                    : !promptToEdit && !(formData.platform_ids || []).length
                      ? "Select platforms first"
                      : "Select story (optional)"}
                </option>
                {storySelectOptions.map((s) => {
                  const sid = s.storyId ?? s.id;
                  return (
                    <option key={sid} value={sid}>
                      {s.storyName || s.name || `Story ${sid}`}
                    </option>
                  );
                })}
              </Input>
            </FormGroup>
            <FormGroup>
              <Label for="chapterId">Chapter (optional)</Label>
              <Input
                type="select"
                id="chapterId"
                value={String(formData.chapter_id ?? "")}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, chapter_id: e.target.value }))
                }
                className="form-control-alternative"
                disabled={!formData.story_id}
              >
                <option value="">All Chapters</option>
                {chapters.map((chapter) => {
                  const chapterId = chapter.chapterId ?? chapter.chapter_id;
                  const chapterName =
                    chapter.chapterName ?? chapter.chapter_name ?? `Chapter ${chapterId}`;
                  return (
                    <option key={chapterId} value={chapterId}>
                      {chapterName}
                    </option>
                  );
                })}
              </Input>
            </FormGroup>
            <FormGroup>
              <Label for="promptType">
                Prompt Type <span className="text-danger">*</span>
              </Label>
              <Input
                type="select"
                id="promptType"
                value={formData.prompt_type_id}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, prompt_type_id: e.target.value }))
                }
                className="form-control-alternative"
              >
                <option value="">Select prompt type</option>
                {promptTypes.map((typeObj, index) => {
                  const value = promptTypeOptionValue(typeObj);
                  const label = promptTypeOptionLabel(typeObj);
                  return (
                    <option key={`${value}-${index}`} value={value}>
                      {label}
                    </option>
                  );
                })}
              </Input>
            </FormGroup>
            <FormGroup>
              <Label for="promptText">
                Prompt Text <span className="text-danger">*</span>
              </Label>
              <Input
                type="textarea"
                id="promptText"
                rows="10"
                value={formData.prompt_text}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, prompt_text: e.target.value }))
                }
                className="form-control-alternative"
                style={{ color: "black" }}
              />
            </FormGroup>
            {promptToEdit ? (
              <Row className="mt-1">
                <Col md="6">
                  <FormGroup className="mb-0">
                    <Label className="text-muted small mb-1" for="editPromptVersion">
                      Version
                    </Label>
                    <Input
                      type="select"
                      id="editPromptVersion"
                      value={String(promptToEdit.id ?? "")}
                      onChange={(e) => switchEditPromptVersion(Number(e.target.value))}
                      disabled={
                        formLoading ||
                        patternVersionsLoading ||
                        (patternVersions.length ? patternVersions : [promptToEdit]).length <= 1
                      }
                      className="form-control-alternative"
                    >
                      {(patternVersions.length ? patternVersions : [promptToEdit]).map((v) => {
                        const pub = !!(v.isPublished ?? v.is_published);
                        return (
                          <option key={v.id} value={v.id}>
                            v{v.version ?? "—"} ·
                            {/* v{v.version ?? "—"} · ID {v.id} */}

                            {pub ? " · Published" : " · Unpublished"}
                          </option>
                        );
                      })}
                    </Input>
                    <small className="text-muted d-block mt-1" style={{ fontSize: "0.75rem" }}>
                      Switch version to edit another row for this same story, chapter, type, and
                      platforms. Only published prompts appear in the main table.
                    </small>
                  </FormGroup>
                </Col>
                <Col md="6">
                  <FormGroup className="mb-0">
                    <Label className="text-muted small mb-1">Publication status</Label>
                    <div className="mt-1">
                      <span
                        style={publishStatusPillStyle(
                          !!(promptToEdit.isPublished ?? promptToEdit.is_published)
                        )}
                      >
                        {(promptToEdit.isPublished ?? promptToEdit.is_published)
                          ? "Published"
                          : "Unpublished"}
                      </span>
                    </div>
                    <small className="text-muted d-block mt-1" style={{ fontSize: "0.75rem" }}>
                      {(() => {
                        const pub = !!(promptToEdit.isPublished ?? promptToEdit.is_published);
                        const fork = pub || isEverPublishedFlag(promptToEdit);
                        if (fork) {
                          if (pub) {
                            return (
                              <>
                                <strong>Update Prompt</strong> saves your edits as a{" "}
                                <strong>new unpublished</strong> row and keeps this published version
                                live. Publish the new row from <strong>Publish</strong> below or from
                                the table <strong>Actions</strong>.
                              </>
                            );
                          }
                          return (
                            <>
                              <strong>Update Prompt</strong> saves your edits as a{" "}
                              <strong>new unpublished</strong> row; this version stays as-is (it was
                              published before). Publish the new row from <strong>Publish</strong>{" "}
                              below or from the table <strong>Actions</strong>.
                            </>
                          );
                        }
                        return (
                          <>
                            <strong>Update Prompt</strong> saves your changes to{" "}
                            <strong>this draft</strong> in place. Use <strong>Publish</strong> below
                            (or table <strong>Actions</strong>) to make this version the active one
                            for this pattern.
                          </>
                        );
                      })()}
                    </small>
                  </FormGroup>
                </Col>
              </Row>
            ) : (
              <div
                className="rounded border px-3 py-2 mt-1"
                style={{
                  backgroundColor: "#f8fafc",
                  borderColor: "#e2e8f0",
                  fontSize: "0.875rem",
                }}
              >
                <span className="font-weight-600 text-dark">Unpublished draft</span>
                <span className="text-muted d-block mt-1">
                  Version is set automatically (next number for this story, type, chapter, and
                  platforms). Use <strong>Actions</strong> on the table after saving to publish.
                </span>
              </div>
            )}
          </Form>
          <div className="d-flex justify-content-between align-items-center flex-wrap mt-4">
            <Button color="secondary" onClick={closeFormModal} disabled={formLoading}>
              Cancel
            </Button>
            <div className="d-flex align-items-center" style={{ gap: "0.5rem" }}>
              {promptToEdit && !(promptToEdit.isPublished ?? promptToEdit.is_published) && (
                <Button
                  color="success"
                  outline
                  type="button"
                  onClick={() => openConfirm("publish", promptToEdit)}
                  disabled={formLoading || actionLoading}
                >
                  Publish
                </Button>
              )}
              <Button
                style={{
                  backgroundColor: "#3A6D8C",
                  borderColor: "#3A6D8C",
                  color: "white",
                }}
                onClick={handleFormSubmit}
                disabled={formLoading || (!!promptToEdit && !editFormIsDirty)}
                title={
                  promptToEdit && !editFormIsDirty
                    ? "Change chapter, prompt type, or prompt text to enable update"
                    : undefined
                }
              >
                {formLoading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Saving...
                  </>
                ) : promptToEdit ? (
                  "Update Prompt"
                ) : (
                  "Create Prompt"
                )}
              </Button>
            </div>
          </div>
        </ModalBody>
      </Modal>

      <Modal
        isOpen={lookupModalOpen}
        toggle={() => setLookupModalOpen(false)}
        centered
        size="lg"
        scrollable
      >
        <ModalHeader className="border-0 pb-0" toggle={() => setLookupModalOpen(false)}>
          Prompt type lookup
        </ModalHeader>
        <ModalBody className="pt-0">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <p className="text-muted small mb-0">
              Manage function names and display labels used in prompts.
            </p>
            <Button
              size="sm"
              style={{
                backgroundColor: "#3A6D8C",
                borderColor: "#3A6D8C",
                color: "white",
              }}
              type="button"
              onClick={openLookupAddForm}
            >
              <i className="fas fa-plus mr-1"></i>
              Add prompt type
            </Button>
          </div>
          {lookupListLoading ? (
            <div className="text-center py-4">
              <Spinner color="primary" />
            </div>
          ) : (
            <div className="table-responsive">
              <Table className="align-items-center table-flush mb-0" size="sm">
                <thead className="thead-light">
                  <tr>
                    <th className="text-center">ID</th>
                    <th>Function name</th>
                    <th>Display</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lookupRows.map((row) => (
                    <tr key={row.id}>
                      <td className="text-center">{row.id}</td>
                      <td>
                        <code className="text-dark small">
                          {row.promptFunctionName || row.prompt_function_name}
                        </code>
                      </td>
                      <td>{row.display || "—"}</td>
                      <td className="text-center">
                        <Button
                          color="link"
                          size="sm"
                          className="p-0"
                          type="button"
                          onClick={() => openLookupEditForm(row)}
                        >
                          <i className="fas fa-edit mr-1" style={{ color: "#3A6D8C" }} />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
          {!lookupListLoading && lookupRows.length === 0 && (
            <p className="text-center text-muted py-3 mb-0">No prompt types yet. Add one above.</p>
          )}
        </ModalBody>
      </Modal>

      <Modal isOpen={lookupFormOpen} toggle={closeLookupForm} centered>
        <ModalHeader className="border-0 pb-0" toggle={closeLookupForm}>
          {lookupFormMode === "add" ? "Add prompt type" : "Edit prompt type"}
        </ModalHeader>
        <ModalBody className="pt-0">
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              submitLookupForm();
            }}
          >
            <FormGroup>
              <Label for="lookupFnName">
                Function name <span className="text-danger">*</span>
              </Label>
              <Input
                id="lookupFnName"
                value={lookupForm.prompt_function_name}
                onChange={(e) =>
                  setLookupForm((prev) => ({ ...prev, prompt_function_name: e.target.value }))
                }
                placeholder="e.g. extract_data_by_story"
                className="form-control-alternative"
                style={{ color: "black" }}
              />
              {lookupFormMode === "edit" && (
                <small className="text-muted">
                  Renaming updates matching rows in prompts and refreshes Redis cache.
                </small>
              )}
            </FormGroup>
            <FormGroup>
              <Label for="lookupDisplay">Display label</Label>
              <Input
                id="lookupDisplay"
                value={lookupForm.display}
                onChange={(e) =>
                  setLookupForm((prev) => ({ ...prev, display: e.target.value }))
                }
                placeholder="User-friendly label"
                className="form-control-alternative"
                style={{ color: "black" }}
              />
            </FormGroup>
            <div className="d-flex justify-content-end gap-3 mt-3">
              <Button color="secondary" type="button" onClick={closeLookupForm} disabled={lookupFormLoading}>
                Cancel
              </Button>
              <Button
                style={{
                  backgroundColor: "#3A6D8C",
                  borderColor: "#3A6D8C",
                  color: "white",
                }}
                type="submit"
                disabled={lookupFormLoading}
              >
                {lookupFormLoading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Saving...
                  </>
                ) : lookupFormMode === "add" ? (
                  "Create"
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </Form>
        </ModalBody>
      </Modal>

      <Modal isOpen={confirmModalOpen} toggle={closeConfirm} centered>
        <ModalHeader className="border-0 pb-0" toggle={closeConfirm}>
          Confirm Action
        </ModalHeader>
        <ModalBody className="pt-0">
          <p className="text-left mb-4">{getConfirmText()}</p>
          <div className="d-flex justify-content-end gap-3">
            <Button color="secondary" onClick={closeConfirm} disabled={actionLoading}>
              Cancel
            </Button>
            <Button
              color={confirmAction === "delete" ? "danger" : "primary"}
              onClick={handleConfirmAction}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Processing...
                </>
              ) : (
                "Confirm"
              )}
            </Button>
          </div>
        </ModalBody>
      </Modal>

      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        position={toast.position}
        onClose={hideToast}
      />
    </>
  );
};

export default PromptsManagement;
