import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
  Container,
  Row,
  Col,
  Card,
  CardHeader,
  CardBody,
  Button,
  Spinner,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from 'reactstrap';
import contextConfigService from 'services/contextConfigService';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTimestamp(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function validateConfig(parsed) {
  if (!parsed || typeof parsed !== 'object') return 'JSON must be an object.';
  if (!Array.isArray(parsed.domains) || parsed.domains.length === 0)
    return '"domains" must be a non-empty array.';
  if (!Array.isArray(parsed.context_scopes) || parsed.context_scopes.length === 0)
    return '"context_scopes" must be a non-empty array.';
  for (let i = 0; i < parsed.context_scopes.length; i++) {
    const s = parsed.context_scopes[i];
    if (!s.scope_name)
      return `context_scopes[${i}] is missing "scope_name".`;
    if (!Array.isArray(s.domains))
      return `context_scopes[${i}] ("${s.scope_name}") is missing "domains" array.`;
    if (!s.signals || typeof s.signals !== 'object')
      return `context_scopes[${i}] ("${s.scope_name}") is missing "signals".`;
  }
  return null; // valid
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  // `AdminNavbar` is absolutely positioned at the top; this extra top padding prevents
  // the Monaco editor from overlapping and blocking navbar clicks.
  page: { padding: '72px 0 80px' },
  subtitle: { color: '#6c757d', fontSize: 14, marginBottom: 20 },
  infoBar: {
    display: 'flex',
    gap: 32,
    background: '#f4f7fa',
    border: '1px solid #dee2e6',
    borderRadius: 6,
    padding: '10px 20px',
    marginBottom: 20,
    fontSize: 13,
    flexWrap: 'wrap',
  },
  infoItem: { display: 'flex', flexDirection: 'column', gap: 2 },
  infoLabel: { color: '#8898aa', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' },
  infoValue: { color: '#32325d', fontWeight: 500 },
  editorWrapper: {
    border: '1px solid #dee2e6',
    borderRadius: 6,
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  unsavedDot: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    color: '#e67e22',
    fontWeight: 500,
    fontSize: 13,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#e67e22',
    display: 'inline-block',
  },
  inlineError: {
    marginTop: 8,
    color: '#e74c3c',
    fontSize: 13,
    background: '#fdf2f2',
    border: '1px solid #f5c6cb',
    borderRadius: 4,
    padding: '8px 12px',
  },
  saveBar: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  banner: (type) => ({
    padding: '12px 20px',
    borderRadius: 6,
    marginBottom: 20,
    fontSize: 14,
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: type === 'success' ? '#d4edda' : type === 'warning' ? '#fff3cd' : '#f8d7da',
    border: `1px solid ${type === 'success' ? '#c3e6cb' : type === 'warning' ? '#ffeeba' : '#f5c6cb'}`,
    color: type === 'success' ? '#155724' : type === 'warning' ? '#856404' : '#721c24',
  }),
  confirmModalTitle: {
    fontSize: 18,
    fontWeight: 600,
  },
  confirmModalBody: {
    fontSize: 24,
    lineHeight: 1.45,
  },
  confirmModalCancelBtn: {
    fontSize: 18,
  },
  confirmModalConfirmBtn: {
    fontSize: 18,
    fontWeight: 600,
  },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function ContextConfig() {
  const [info, setInfo] = useState({ id: null, createdAt: null, domains: 0, scopes: 0 });
  const [editorValue, setEditorValue] = useState('');
  const [snapshot, setSnapshot] = useState('');       // last saved content
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inlineError, setInlineError] = useState('');
  const [banner, setBanner] = useState(null);         // { type, message }
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const editorRef = useRef(null);

  const hasUnsaved = editorValue !== snapshot;

  // ── Load on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    setInlineError('');
    setBanner(null);
    try {
      const data = await contextConfigService.getContextConfig();
      if (data?.seed_data) {
        const pretty = JSON.stringify(data.seed_data, null, 2);
        setEditorValue(pretty);
        setSnapshot(pretty);
        setInfo({
          id: data.id,
          createdAt: data.created_at,
          domains: data.seed_data.domains?.length ?? 0,
          scopes: data.seed_data.context_scopes?.length ?? 0,
        });
      } else {
        setEditorValue('');
        setSnapshot('');
      }
    } catch (err) {
      setBanner({ type: 'error', message: 'Failed to load config: ' + (err?.response?.data?.error || err.message) });
    } finally {
      setLoading(false);
    }
  }

  // ── Format JSON ────────────────────────────────────────────────────────────
  function handleFormat() {
    setInlineError('');
    try {
      const parsed = JSON.parse(editorValue);
      setEditorValue(JSON.stringify(parsed, null, 2));
    } catch {
      setInlineError('Cannot format — invalid JSON.');
    }
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function handleResetClick() {
    setConfirmReset(true);
  }
  function handleResetConfirm() {
    setEditorValue(snapshot);
    setInlineError('');
    setConfirmReset(false);
  }
  function handleResetCancel() {
    setConfirmReset(false);
  }

  // ── Save & Publish ─────────────────────────────────────────────────────────
  async function handleSave() {
    setInlineError('');
    setBanner(null);

    // 1. Parse
    let parsed;
    try {
      parsed = JSON.parse(editorValue);
    } catch {
      setInlineError('Invalid JSON. Please fix before saving.');
      return;
    }

    // 2. Validate
    const validationError = validateConfig(parsed);
    if (validationError) {
      setInlineError(validationError);
      return;
    }

    // 3. Save
    setSaving(true);
    try {
      const result = await contextConfigService.saveContextConfig(parsed);

      // Update info bar + snapshot
      const pretty = JSON.stringify(parsed, null, 2);
      setSnapshot(pretty);
      setEditorValue(pretty);
      setInfo({
        id: result.id,
        createdAt: new Date().toISOString(),
        domains: parsed.domains.length,
        scopes: parsed.context_scopes.length,
      });

      if (result.reloaded) {
        setBanner({
          type: 'success',
          message: `Config saved and published successfully. Version ${result.id} is now live.`,
        });
      } else {
        setBanner({
          type: 'warning',
          message: result.warning || 'Config saved but Context Builder reload failed. Please trigger reload manually.',
        });
      }
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err.message ||
        'Unknown error.';
      setBanner({ type: 'error', message: `Failed to save config. ${msg}` });
    } finally {
      setSaving(false);
    }
  }

  function handleSaveClick() {
    setConfirmSave(true);
  }

  function handleSaveConfirm() {
    setConfirmSave(false);
    handleSave();
  }

  function handleSaveCancel() {
    setConfirmSave(false);
  }

  // ── Editor mount ───────────────────────────────────────────────────────────
  function handleEditorMount(editor) {
    editorRef.current = editor;
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <Container fluid style={styles.page}>
      {/* Header */}
      <Row>
        <Col>
          <h2 style={{ fontWeight: 700, color: '#fff', marginBottom: 4 }}>
            CONTEXT MANAGEMENT
          </h2>
          <p style={{ ...styles.subtitle, color: '#fff' }}>
            Edit and publish the context scopes configuration. Changes take effect immediately.
          </p>
        </Col>
      </Row>

      {/* Status Banner */}
      {banner && (
        <Row>
          <Col>
            <div style={styles.banner(banner.type)}>
              <span>
                {banner.type === 'success' ? '✓' : banner.type === 'warning' ? '⚠' : '✕'}
              </span>
              {banner.message}
            </div>
          </Col>
        </Row>
      )}

      {/* Info Bar */}
      <Row>
        <Col>
          <div style={styles.infoBar}>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Last Saved</span>
              <span style={styles.infoValue}>{formatTimestamp(info.createdAt)}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Version ID</span>
              <span style={styles.infoValue}>{info.id ?? '—'}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Domains</span>
              <span style={styles.infoValue}>{info.domains}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Scopes</span>
              <span style={styles.infoValue}>{info.scopes}</span>
            </div>
          </div>
        </Col>
      </Row>

      {/* Editor Card */}
      {/* <Row>
        <Col>
          <Card style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <CardHeader style={{ background: '#fff', borderBottom: '1px solid #e9ecef', padding: '14px 20px' }}>
              <span style={{ fontWeight: 600, color: '#32325d', fontSize: 15 }}>JSON Editor</span>
            </CardHeader>
            <CardBody style={{ padding: 0 }}>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 600 }}>
                  <Spinner color="primary" />
                </div>
              ) : (
                <div style={styles.editorWrapper}>
                  <Editor
                    height="600px"
                    defaultLanguage="json"
                    value={editorValue}
                    onChange={(val) => {
                      setEditorValue(val ?? '');
                      setInlineError('');
                    }}
                    onMount={handleEditorMount}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineNumbers: 'on',
                      wordWrap: 'off',
                      scrollBeyondLastLine: false,
                      tabSize: 2,
                      formatOnPaste: false,
                      automaticLayout: true,
                      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                    }}
                    theme="light"
                  />
                </div>
              )}
            </CardBody>
          </Card> */}

          {/* Inline Error */}
          {/* {inlineError && <div style={styles.inlineError}>{inlineError}</div>} */}

          {/* Toolbar */}
          {/* <div style={styles.toolbar}>
            <Button
              color="secondary"
              outline
              size="sm"
              onClick={handleFormat}
              disabled={loading || saving}
            >
              Format JSON
            </Button>

            <Button
              color="warning"
              outline
              size="sm"
              onClick={handleResetClick}
              disabled={loading || saving || !hasUnsaved}
            >
              Reset to Last Saved
            </Button>

            {hasUnsaved && (
              <span style={styles.unsavedDot}>
                <span style={styles.dot} />
                Unsaved changes
              </span>
            )}
          </div> */}

          {/* Confirm Reset Dialog */}
          {/* {confirmReset && (
            <div style={{
              marginTop: 12,
              background: '#fff3cd',
              border: '1px solid #ffeeba',
              borderRadius: 6,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              fontSize: 14,
              color: '#856404',
            }}>
              <span>Reset all changes? This cannot be undone.</span>
              <Button color="danger" size="sm" onClick={handleResetConfirm}>Confirm Reset</Button>
              <Button color="secondary" outline size="sm" onClick={handleResetCancel}>Cancel</Button>
            </div>
          )} */}

          {/* Save Bar */}
          {/* <div style={styles.saveBar}>
            <Button
              color="primary"
              onClick={handleSaveClick}
              disabled={loading || saving || !hasUnsaved}
              style={{ minWidth: 160, fontWeight: 600 }}
            >
              {saving ? (
                <>
                  <Spinner size="sm" style={{ marginRight: 8 }} />
                  Saving...
                </>
              ) : (
                'Save & Publish'
              )}
            </Button>
          </div> */}

          {/* <Modal isOpen={confirmSave} toggle={handleSaveCancel} centered>
            <ModalHeader toggle={handleSaveCancel}>
              <span style={styles.confirmModalTitle}>Confirm Save & Publish</span>
            </ModalHeader>
            <ModalBody style={styles.confirmModalBody}>
              Are you sure you want to save and publish these changes? This will make the
              updated context configuration live immediately.
            </ModalBody>
            <ModalFooter>
              <Button
                color="secondary"
                outline
                onClick={handleSaveCancel}
                style={styles.confirmModalCancelBtn}
              >
                Cancel
              </Button>
              <Button
                color="primary"
                onClick={handleSaveConfirm}
                style={styles.confirmModalConfirmBtn}
              >
                Yes, Save & Publish
              </Button>
            </ModalFooter>
          </Modal>
        </Col>
      </Row> */}


      {/* MAIN CONTENT + RIGHT PANEL */}
      <Row>
        <Col style={{ height: "75vh" }}>
          <div className="d-flex" style={{ height: "100%", border: "1px solid #dee2e6", borderRadius: 6, overflow: "hidden" }}>
            
            {/* MAIN CONTENT */}
            <div className="flex-grow-1 p-3" style={{ background: "#f8f9fa", overflowY: "auto" }}>
              
              {/* Header */}
              <h5 style={{ fontWeight: 600, marginBottom: 16 }}>
                Data Domain & Signal Registry
              </h5>

              {/* Toolbar */}
              <div className="mb-3">

        {/* Top Row: Button + Search */}
        <div className="d-flex align-items-center" style={{ gap: 10 }}>
          <Button color="primary" size="sm">+ Add Scope</Button>

          <input
            type="text"
            placeholder="Search scope"
            className="form-control form-control-sm"
            style={{ maxWidth: 250 }}
          />
        </div>

        {/* Second Row: Domain Chips */}
        <div className="d-flex mt-2" style={{ gap: 8 }}>
          {[
            { name: "Finance", color: "#f6c23e" },
            { name: "Caregiving", color: "#858796" },
            { name: "Health", color: "#1cc88a" },
            { name: "Digital", color: "#36b9cc" },
          ].map((d) => (
            <span
              key={d.name}
              style={{
                background: d.color,
                color: "#fff",
                padding: "4px 10px",
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {d.name}
            </span>
          ))}
        </div>
      </div>

        {/* Table */}
        <table className="table table-sm table-hover bg-white">
          <thead className="thead-light">
            <tr>
              <th style={{ width: 30 }}></th>
              <th>Scope Name</th>
              <th>Level</th>
              <th>Domains</th>
              <th>Signals Count</th>
              <th>Last Modified</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><input type="checkbox" /></td>
              <td className="text-primary font-weight-bold">Additional Recurring Income</td>
              <td>story</td>
              <td>
                <span className="badge badge-warning mr-1">Finance</span>
              </td>
              <td>3</td>
              <td>2/11/2023 13:09</td>
              <td className="text-center">⋯</td>
            </tr>
            <tr>
              <td><input type="checkbox" /></td>
              <td className="text-primary font-weight-bold">Aging</td>
              <td>story</td>
              <td>
                <span className="badge badge-secondary mr-1">Caregiving</span>
                <span className="badge badge-success">Health</span>
              </td>
              <td>6</td>
              <td>2/11/2023 13:07</td>
              <td className="text-center">⋯</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* RIGHT PANEL */}
      <div style={{ width: 380, borderLeft: "1px solid #dee2e6", background: "#fff", overflowY: "auto" }}>
        <div style={{ padding: 16 }}>
          
          {/* Header */}
          <div className="d-flex justify-content-between mb-3">
            <div>
              <div style={{ fontWeight: 600 }}>Scope Editor: Assets</div>
              <div style={{ fontSize: 12, color: "#6c757d" }}>
                Dynamically loads details when a specific scope is selected.
              </div>
            </div>
            <span style={{ cursor: "pointer" }}>✕</span>
          </div>

          {/* Tabs */}
          <ul className="nav nav-tabs mb-3">
            <li className="nav-item">
              <span className="nav-link">Scope Info</span>
            </li>
            <li className="nav-item">
              <span className="nav-link active">Signals</span>
            </li>
            <li className="nav-item">
              <span className="nav-link">Mapping Logic</span>
            </li>
          </ul>

          <div className="text-right mb-2">
            <Button size="sm" color="primary">Add signal logic</Button>
          </div>

          {/* Accordion */}
          <div className="card mb-2">
            <div className="card-header">Has Timeshares</div>
            <div className="card-body">
              <p><strong>Type:</strong> yes/no</p>
              <p><strong>Source:</strong> Care Receivers → itemId: 2585 → Timeshares</p>

              <div className="form-group">
                <label>Mapping</label>
                <input className="form-control" value="single_document" readOnly />
              </div>

              <div className="form-group">
                <label>Scope</label>
                <select className="form-control">
                  <option>single_document</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card mb-2">
            <div className="card-header">Has Business Equity</div>
          </div>

          <div className="card">
            <div className="card-header">Number of Bank Accounts</div>
            <div className="card-body">
              <p><strong>Type:</strong> calculation</p>

              <div className="form-group">
                <label>Method</label>
                <select className="form-control">
                  <option>count</option>
                </select>
              </div>

              <div className="form-group">
                <label>Scope</label>
                <select className="form-control">
                  <option>repeating_collection</option>
                </select>
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>
  </Col>
</Row>
    </Container>
      );
}