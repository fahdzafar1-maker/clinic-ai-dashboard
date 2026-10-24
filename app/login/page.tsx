'use client';

import { useState } from 'react';
import { useClinic } from '@/components/ClinicProvider';
import { Logo } from '@/components/Shell';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const { config } = useClinic();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <Logo size={44} />
        <h1>{config.name}</h1>
        <p className="muted">Sign in to the AI front-desk dashboard</p>
        {!supabase ? (
          <p className="hint">Supabase isn’t configured, so no login is needed. <a className="link" href="/">Open the demo</a></p>
        ) : (
          <>
            <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            {error && <div className="banner banner-error">{error}</div>}
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </>
        )}
      </form>
    </div>
  );
}
