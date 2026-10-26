'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { supabase } from '@/lib/supabase';

const CHAT_URL = process.env.NEXT_PUBLIC_CHAT_WEBHOOK_URL || 'https://primary-production-8d9a.up.railway.app/webhook/clinic-os/chat';

interface Msg { role: 'user' | 'assistant'; content: string }

function sessionId(slug: string) {
  const key = `clinic-chat:${slug}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

/** Website chat for one clinic. Used full-page, inside the widget iframe, and on demo pages. */
export default function ChatPage() {
  const { slug } = useParams<{ slug: string }>();
  const [clinic, setClinic] = useState<{ name: string; agent: string; color: string } | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let name = 'our clinic', agent = 'Sara', color = '#1593a3';
    const done = () => {
      setClinic({ name, agent, color });
      setMessages([{ role: 'assistant', content: `Hi! I'm ${agent}, the virtual assistant of ${name}. How can I help you today?` }]);
    };
    if (!supabase) { done(); return; }
    supabase.rpc('get_demo', { p_slug: slug }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : null;
      if (row) {
        name = row.name;
        agent = row.config?.receptionist?.name || agent;
        color = row.config?.primary || color;
      }
      done();
    });
  }, [slug]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, sending]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const content = text.trim().slice(0, 600);
    if (!content || sending) return;
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setText('');
    setSending(true);
    try {
      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The greeting is shown locally only; the AI gets the real conversation.
        body: JSON.stringify({ slug, sessionId: sessionId(slug), messages: next.slice(1) }),
      });
      const data = await res.json().catch(() => ({}));
      setMessages((m) => [...m, { role: 'assistant', content: data.reply || 'Sorry, something went wrong. Please try again.' }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Sorry, I could not connect. Please check your internet and try again.' }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chatpage" style={{ ['--chat' as string]: clinic?.color ?? '#1593a3' }}>
      <header className="chat-head">
        <span className="chat-avatar"><Icon name="sparkle" size={18} /></span>
        <div>
          <div className="chat-title">{clinic?.name ?? '…'}</div>
          <div className="chat-sub"><i />{clinic ? `${clinic.agent} · AI assistant · usually replies instantly` : 'Connecting…'}</div>
        </div>
      </header>
      <div className="chat-list" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>{m.content}</div>
        ))}
        {sending && <div className="chat-msg assistant typing"><span /><span /><span /></div>}
      </div>
      <form className="chat-input" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your message…" maxLength={600} disabled={!clinic} aria-label="Message" />
        <button disabled={!text.trim() || sending} aria-label="Send"><Icon name="arrowRight" /></button>
      </form>
      <div className="chat-foot">AI assistant · no medical advice · in an emergency call your local emergency number</div>
    </div>
  );
}
