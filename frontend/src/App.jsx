import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  FileText, 
  Upload, 
  Sparkles, 
  MessageSquare, 
  Database, 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Send, 
  BrainCircuit,
  Cpu
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const AI_SERVICE_URL = import.meta.env.VITE_AI_SERVICE_URL || 'http://localhost:8000';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [healthStatus, setHealthStatus] = useState({ backend: 'checking', aiService: 'checking' });

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);

  // Q&A State
  const [question, setQuestion] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [qaResult, setQaResult] = useState(null);

  useEffect(() => {
    fetchHealthStatus();
    fetchDocuments();
  }, []);

  const fetchHealthStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/v1/health`);
      setHealthStatus({
        backend: res.data.status === 'UP' ? 'up' : 'down',
        aiService: res.data.ai_service?.status === 'UP' ? 'up' : 'down'
      });
    } catch (err) {
      setHealthStatus({ backend: 'down', aiService: 'down' });
    }
  };

  const fetchDocuments = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/v1/documents`);
      setDocuments(res.data);
      if (res.data.length > 0 && !selectedDoc) {
        setSelectedDoc(res.data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch documents', err);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if ((!title.trim() && !selectedFile) || (!content.trim() && !selectedFile)) return;

    setLoading(true);
    try {
      let res;
      if (selectedFile) {
        const extractionForm = new FormData();
        const extractionId = `upload_${Date.now()}`;
        extractionForm.append('document_id', extractionId);
        extractionForm.append('file', selectedFile);
        const extraction = await axios.post(`${AI_SERVICE_URL}/api/v1/extract/file`, extractionForm);

        res = await axios.post(`${API_BASE_URL}/api/v1/documents`, {
          title: selectedFile.name,
          content: extraction.data.combined_text,
          contentType: selectedFile.type || 'application/octet-stream',
          pages: extraction.data.pages,
          sections: extraction.data.sections,
          chunks: extraction.data.chunks
        });
      } else {
        res = await axios.post(`${API_BASE_URL}/api/v1/documents`, {
          title,
          content,
          contentType: 'text/plain'
        });
      }

      setDocuments([res.data, ...documents]);
      setSelectedDoc(res.data);
      setTitle('');
      setContent('');
      setSelectedFile(null);
      setQaResult(null);
    } catch (err) {
      alert('Document processing failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleAskQuestion = async (e) => {
    e.preventDefault();
    if (!selectedDoc || !question.trim()) return;

    setQaLoading(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/v1/documents/${selectedDoc.id}/qa`, {
        question
      });
      setQaResult(res.data);
    } catch (err) {
      alert('Q&A failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setQaLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-icon">
            <BrainCircuit size={24} />
          </div>
          <div>
            <h1 className="brand-title">IntelliDoc</h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Enterprise Centralised AI Intelligence Platform</p>
          </div>
        </div>

        <div className="system-status-bar">
          <div className="status-pill">
            <Database size={14} />
            <span>Supabase DB</span>
            <span className="dot-indicator up"></span>
          </div>
          <div className="status-pill">
            <Activity size={14} />
            <span>Spring Boot API</span>
            <span className={`dot-indicator ${healthStatus.backend}`}></span>
          </div>
          <div className="status-pill">
            <Cpu size={14} />
            <span>Python AI Service</span>
            <span className={`dot-indicator ${healthStatus.aiService}`}></span>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <div className="dashboard-grid">
        {/* Left Column: Upload & Document Vault */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Upload Card */}
          <div className="glass-panel">
            <h2 className="section-title">
              <Upload size={20} color="var(--primary-glow)" /> Upload Document
            </h2>

            <form onSubmit={handleUpload}>
              <div className="form-group">
                <label className="form-label">Document Title</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Q3 Financial Performance Report.txt"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Document File (PDF, DOCX, or image)</label>
                <input
                  type="file"
                  className="form-input"
                  accept=".pdf,.docx,.png,.jpg,.jpeg,.tif,.tiff"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Document Text Content</label>
                <textarea 
                  className="form-textarea" 
                  rows={4}
                  placeholder="Paste document text or contract clauses here for instant analysis..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={Boolean(selectedFile)}
                />
              </div>

              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? (
                  <>
                    <Activity size={18} className="spin" /> Processing AI Pipeline...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} /> Analyze with AI Engine
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Document Vault List */}
          <div className="glass-panel">
            <h2 className="section-title">
              <FileText size={20} color="var(--cyan-accent)" /> Document Vault ({documents.length})
            </h2>

            {documents.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', textAlign: 'center', padding: '1.5rem' }}>
                No documents uploaded yet. Upload a document to trigger automated AI analysis.
              </p>
            ) : (
              <div className="doc-list">
                {documents.map((doc) => (
                  <div 
                    key={doc.id} 
                    className={`doc-item ${selectedDoc?.id === doc.id ? 'active' : ''}`}
                    onClick={() => { setSelectedDoc(doc); setQaResult(null); }}
                  >
                    <div className="doc-info">
                      <span className="doc-title">{doc.title}</span>
                      <span className="doc-meta">ID: {doc.id}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {doc.sentiment && (
                        <span className={`badge ${doc.sentiment}`}>{doc.sentiment}</span>
                      )}
                      <span className={`badge ${doc.status}`}>{doc.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: AI Insights & Smart Q&A */}
        <div>
          {selectedDoc ? (
            <div className="glass-panel" style={{ minHeight: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div>
                  <h2 className="section-title" style={{ marginBottom: '0.2rem' }}>
                    <Sparkles size={20} color="var(--purple-accent)" /> {selectedDoc.title}
                  </h2>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Document ID: {selectedDoc.id}</p>
                </div>

                {selectedDoc.sentiment && (
                  <span className={`badge ${selectedDoc.sentiment}`} style={{ fontSize: '0.85rem' }}>
                    {selectedDoc.sentiment} SENTIMENT
                  </span>
                )}
              </div>

              {/* Executive Summary */}
              <div className="insight-box">
                <div className="insight-label">Executive AI Summary</div>
                <p style={{ fontSize: '0.95rem', color: '#e5e7eb', lineHeight: '1.6' }}>
                  {selectedDoc.summary || 'AI summarization processing in progress...'}
                </p>
                {selectedDoc.confidenceScore && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--cyan-accent)', marginTop: '0.5rem' }}>
                    Model Confidence: {(selectedDoc.confidenceScore * 100).toFixed(0)}%
                  </div>
                )}
              </div>

              {/* Entities & Topics */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="insight-box">
                  <div className="insight-label">Extracted Entities</div>
                  <div className="tags-cloud">
                    {selectedDoc.entities && selectedDoc.entities.length > 0 ? (
                      selectedDoc.entities.map((e, idx) => <span key={idx} className="tag-chip">{e}</span>)
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>None detected</span>
                    )}
                  </div>
                </div>

                <div className="insight-box">
                  <div className="insight-label">Key Topics</div>
                  <div className="tags-cloud">
                    {selectedDoc.keyTopics && selectedDoc.keyTopics.length > 0 ? (
                      selectedDoc.keyTopics.map((t, idx) => <span key={idx} className="tag-chip topic">{t}</span>)
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>General</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Q&A Interactive Assistant */}
              <div className="qa-section">
                <h3 className="section-title" style={{ fontSize: '1.1rem' }}>
                  <MessageSquare size={18} color="var(--cyan-accent)" /> Interactive Smart Q&A
                </h3>

                <form onSubmit={handleAskQuestion} className="qa-input-row">
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Ask a question about this document context..."
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    required
                  />
                  <button type="submit" className="btn-primary" style={{ width: 'auto' }} disabled={qaLoading}>
                    {qaLoading ? <Activity size={16} className="spin" /> : <Send size={16} />}
                  </button>
                </form>

                {qaResult && (
                  <div className="qa-response-box">
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                      Q: {qaResult.question}
                    </div>
                    <div className="qa-answer">
                      <strong>Answer:</strong> {qaResult.answer}
                    </div>
                    <div className="qa-confidence">
                      {qaResult.is_not_found
                        ? 'No supporting evidence found in this document.'
                        : `Confidence: ${(qaResult.confidence * 100).toFixed(0)}%`}
                    </div>
                    {qaResult.citations?.length > 0 && (
                      <div className="qa-confidence">
                        Source: {qaResult.citations.map((citation) => (
                          citation.page_number ? `Page ${citation.page_number}` : 'Document text'
                        )).join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <BrainCircuit size={48} color="var(--text-dim)" style={{ marginBottom: '1rem' }} />
              <h3 style={{ color: 'var(--text-muted)' }}>No Document Selected</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Select a document from the vault or upload a new text document to view AI insights.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
