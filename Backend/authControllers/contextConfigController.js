import sequelize from "../config/db.js";
import axios from "axios";
import Logger from "../logger/logger.js";

// GET /admin/context-config
export const getContextConfig = async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT id, seed_data, created_at
       FROM context_config
       ORDER BY id DESC LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (!rows) {
      return res.status(200).json({ seed_data: null });
    }

    return res.status(200).json({
      id: rows.id,
      seed_data: rows.seed_data,
      created_at: rows.created_at,
    });
  } catch (error) {
    Logger.error("Error fetching context config:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /admin/context-config
export const saveContextConfig = async (req, res) => {
  const { seed_data } = req.body;

  // --- Validation ---
  if (!seed_data || typeof seed_data !== "object") {
    return res.status(422).json({ error: "seed_data must be a JSON object" });
  }

  if (!Array.isArray(seed_data.domains) || seed_data.domains.length === 0) {
    return res.status(422).json({ error: "seed_data.domains must be a non-empty array" });
  }

  if (!Array.isArray(seed_data.context_scopes) || seed_data.context_scopes.length === 0) {
    return res.status(422).json({ error: "seed_data.context_scopes must be a non-empty array" });
  }

  for (let i = 0; i < seed_data.context_scopes.length; i++) {
    const scope = seed_data.context_scopes[i];
    if (!scope.scope_name || !scope.domains || !scope.signals) {
      return res.status(422).json({
        error: `context_scopes[${i}] must have scope_name, domains, and signals`,
      });
    }
  }

  // --- Insert ---
  let newId;
  try {
    const [result] = await sequelize.query(
      `INSERT INTO context_config (seed_data) VALUES (?)`,
      {
        replacements: [JSON.stringify(seed_data)],
        type: sequelize.QueryTypes.INSERT,
      }
    );
    newId = result;
  } catch (error) {
    Logger.error("Error inserting context config:", error);
    return res.status(500).json({ success: false, error: error.message });
  }

  // --- Notify Context Builder ---
  let reloaded = false;
  let warning = null;

  try {
    const contextBuilderUrl = process.env.CONTEXT_BUILDER_URL || "https://stochastic-planning-core-1011027887079.us-central1.run.app";
    await axios.post(
      `${contextBuilderUrl}/api/context/reload-config`,
      null,
      {
        headers: { "X-Admin-Key": process.env.ADMIN_API_KEY },
        timeout: 10000,
      }
    );
    reloaded = true;
  } catch (error) {
    Logger.warn("Context Builder reload failed:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      code: error.code,
    });
    warning = "Config saved but Context Builder reload failed. Call reload manually.";
  }

  return res.status(200).json({
    success: true,
    id: newId,
    reloaded,
    warning,
  });
};
