import React, { useState, useRef, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { sendMessage } from './api';
import './Chat.css';

// ── helpers ──────────────────────────────────────────────────────────────────

function detectLang(code) {
  if (/^(name:|on:|jobs:|steps:|uses:|run:|with:|triggers:)/m.test(code)) return 'yaml';
  if (/^(resource|provider|terraform|variable|output|module)\s/m.test(code)) return 'hcl';
  return 'yaml';
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="code-wrapper">
      <div className="code-header">
        <span>{lang}</span>
        <button onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
      </div>
      <SyntaxHighlighter language={lang} style={oneDark} customStyle={{ margin: 0, borderRadius: '0 0 8px 8px', fontSize: 13 }}>
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

// Renders plain text interleaved with fenced code blocks
function RichText({ text }) {
  if (!text) return null;
  const parts = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0, match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: 'text', content: text.slice(last, match.index) });
    parts.push({ type: 'code', lang: match[1] || detectLang(match[2]), content: match[2].trim() });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', content: text.slice(last) });
  return (
    <div>
      {parts.map((p, i) =>
        p.type === 'code'
          ? <CodeBlock key={i} lang={p.lang} code={p.content} />
          : <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{p.content}</span>
      )}
    </div>
  );
}

// ── Dialogue box (variable_validation: true) ─────────────────────────────────

function DialogueBox({ data, onClose }) {
  const { yamlText, note, message, status } = data;
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(yamlText || ''); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <>
      {/* backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100 }} />

      {/* panel */}
      <div style={{
        position: 'fixed', top: 20, right: 20, bottom: 20, width: 540,
        background: '#1a1d27', border: '1px solid #3d4466', borderRadius: 14,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)', zIndex: 101,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* header - fixed height */}
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #2d3148' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#7c8cf8' }}>
            {status === true ? '✅ Task Completed' : status === false ? '❌ Task Failed' : 'Output'}
          </span>
          <button className="dialogue-close" onClick={onClose}>✕</button>
        </div>

        {/* scrollable body */}
        <div style={{ flex: '1 1 0', overflowY: 'auto', overflowX: 'hidden', padding: '16px 18px' }}>
          {message && <div className="dialogue-message" style={{ marginBottom: 12 }}>{message}</div>}
          {yamlText && (
            <div className="code-wrapper" style={{ marginBottom: 12 }}>
              <div className="code-header">
                <span>yaml</span>
                <button onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
              </div>
              <SyntaxHighlighter
                language="yaml"
                style={oneDark}
                customStyle={{ margin: 0, borderRadius: '0 0 8px 8px', fontSize: 13, overflowX: 'auto', overflowY: 'visible', maxHeight: 'none' }}
              >
                {yamlText}
              </SyntaxHighlighter>
            </div>
          )}
          {note && <div className="dialogue-note">💡 {note}</div>}
        </div>
      </div>
    </>
  );
}

// ── Missing params renderer (list of strings OR list of dicts) ────────────────

function MissingParams({ missing }) {
  if (!missing?.length) return null;
  return (
    <div className="missing-params">
      <strong>Missing Parameters</strong>
      <div className="missing-list">
        {missing.map((item, i) => {
          if (typeof item === 'object') {
            return Object.entries(item).map(([tool, params]) => (
              <div key={`${i}-${tool}`} className="missing-group">
                <span className="tool-label">{tool}</span>
                <div className="chips">
                  {(Array.isArray(params) ? params : [params]).map((p, j) => (
                    <span key={j} className="chip">{p}</span>
                  ))}
                </div>
              </div>
            ));
          }
          return <span key={i} className="chip">{item}</span>;
        })}
      </div>
    </div>
  );
}

// ── Question stepper cards ────────────────────────────────────────────────────

function QuestionStepper({ questions, onSubmit }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(Array(questions.length).fill(''));
  const inputRef = useRef(null);

  useEffect(() => inputRef.current?.focus(), [step]);

  function handleNext() {
    if (!answers[step].trim()) return;
    if (step < questions.length - 1) {
      setStep(s => s + 1);
    } else {
      // compile all Q&A into a single prompt string
      const prompt = questions.map((q, i) => `${q}\nAnswer: ${answers[i].trim()}`).join('\n\n');
      onSubmit(prompt);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleNext(); }
  }

  const isLast = step === questions.length - 1;

  return (
    <div className="stepper">
      <div className="stepper-progress">
        {questions.map((_, i) => (
          <div key={i} className={`step-dot ${i < step ? 'done' : i === step ? 'active' : ''}`} />
        ))}
      </div>
      <div className="stepper-card">
        <div className="stepper-count">{step + 1} / {questions.length}</div>
        <p className="stepper-question">{questions[step]}</p>
        <textarea
          ref={inputRef}
          className="stepper-input"
          rows={3}
          value={answers[step]}
          onChange={e => { const a = [...answers]; a[step] = e.target.value; setAnswers(a); }}
          onKeyDown={handleKey}
          placeholder="Type your answer..."
        />
        <div className="stepper-footer">
          {step > 0 && (
            <button className="stepper-back" onClick={() => setStep(s => s - 1)}>← Back</button>
          )}
          <button
            className="stepper-next"
            onClick={handleNext}
            disabled={!answers[step].trim()}
          >
            {isLast ? 'Submit ✓' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bot message (variable_validation: false) ──────────────────────────────────

function BotMessage({ data, onSubmitAnswers }) {
  const out = data?.output || {};
  const message = typeof out === 'string' ? out : out.message || '';
  const missing = typeof out === 'object' ? (out.missing_parameters || []) : [];
  const note = typeof out === 'object' ? (out.note || '') : '';
  const questions = typeof out === 'object' ? (out.questions || []) : [];

  return (
    <div className="bot-message-body">
      {message && <div className="bot-message-text"><RichText text={message} /></div>}
      <MissingParams missing={missing} />
      {note && <div className="note">💡 {note}</div>}
      {questions.length > 0 && (
        <QuestionStepper questions={questions} onSubmit={onSubmitAnswers} />
      )}
    </div>
  );
}

// ── Welcome ───────────────────────────────────────────────────────────────────

const WELCOME = {
  role: 'bot',
  validationFalse: true,
  data: {
    variable_validation: false,
    output: {
      message: "Hi! I'm your DevOps YAML Agent. I can help you build CI/CD pipelines, Terraform infrastructure, or update YAML files.",
      missing_parameters: [],
      questions: [],
      note: "Just describe what you want to build and I'll take it from there!"
    }
  }
};

// ── Main Chat ─────────────────────────────────────────────────────────────────

export default function Chat() {
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [dialogue, setDialogue] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  async function submitPrompt(prompt) {
    if (!prompt) return;
    setMessages(prev => [...prev, { role: 'user', text: prompt }]);
    setLoading(true);
    try {
      const { parsed, responseId } = await sendMessage(prompt, conversationId);
      if (responseId) setConversationId(responseId);

      if (parsed.variable_validation === true) {
        // output may be a string or a structured object like { "TASK COMPLETED": "...", Status, Message, Note }
        const raw = parsed.output;
        let yamlText = null;
        let note = null;
        let message = null;
        let status = null;

        if (typeof raw === 'object' && raw !== null) {
          yamlText = raw['TASK COMPLETED'] || null;
          status = raw['Status'] ?? null;
          message = raw['Message'] || null;
          note = raw['Note'] || null;
        } else {
          yamlText = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
        }

        const dialogueData = { yamlText, note, message, status };
        setDialogue(dialogueData);
        setMessages(prev => [...prev, { role: 'bot', validationTrue: true, dialogueData }]);
      } else {
        setMessages(prev => [...prev, { role: 'bot', validationFalse: true, data: parsed }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'bot', validationFalse: true,
        data: { variable_validation: false, output: { message: `⚠️ Error: ${err.message}`, missing_parameters: [], questions: [], note: '' } }
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitPrompt(input.trim()); setInput(''); }
  }

  function handleNewChat() {
    setMessages([WELCOME]);
    setConversationId(null);
    setDialogue(null);
    setInput('');
  }

  return (
    <div className="chat-container">
      <header className="chat-header">
        <div className="header-left">
          <span className="header-icon">⚙️</span>
          <div>
            <h1>YAML Agent</h1>
            <p>CI · CD · Terraform · YAML</p>
          </div>
        </div>
        <button className="new-chat-btn" onClick={handleNewChat}>+ New Chat</button>
      </header>

      <div className="messages">       
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.role === 'bot' && <div className="avatar">🤖</div>}
            <div className="bubble">
              {msg.role === 'user' && <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>}
              {msg.validationTrue && (
                <div className="validation-true-preview">
                  ✅ Pipeline generated —{' '}
                  <button className="view-output-btn" onClick={() => setDialogue(msg.dialogueData)}>
                    View Output
                  </button>
                </div>
              )}
              {msg.validationFalse && (
                <BotMessage data={msg.data} onSubmitAnswers={submitPrompt} />
              )}
            </div>
            {msg.role === 'user' && <div className="avatar user-avatar">👤</div>}
          </div>
        ))}

        {loading && (
          <div className="message bot">
            <div className="avatar">🤖</div>
            <div className="bubble typing"><span /><span /><span /></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="input-area">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Describe what you want to build... (Enter to send, Shift+Enter for new line)"
          rows={2}
          disabled={loading}
        />
        <button onClick={() => { submitPrompt(input.trim()); setInput(''); }} disabled={loading || !input.trim()} className="send-btn">
          {loading ? '⏳' : '➤'}
        </button>
      </div>

      {dialogue && <DialogueBox data={dialogue} onClose={() => setDialogue(null)} />}
    </div>
  );
}
