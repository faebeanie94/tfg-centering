import { useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import * as api from '../lib/api-client';

export function LoginPrompt() {
  const open = useSyncExternalStore(api.subscribeToLoginPrompt, api.isLoginPromptOpen);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  function close(signedIn: boolean) {
    setPassword('');
    setError(null);
    api.closeLoginPrompt(signedIn);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.login(password);
      close(true);
    } catch (err) {
      setError(err instanceof api.ApiError && err.statusCode ? err.message : 'Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay">
      <form className="modal-dialog" onSubmit={handleSubmit}>
        <div className="modal-header">
          <h2>Sign in</h2>
        </div>

        <div className="modal-content">
          <div className="form-group">
            <label htmlFor="team-password">Team password</label>
            <input
              id="team-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p role="alert">{error}</p>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={() => close(false)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || !password}>
            Sign in
          </button>
        </div>
      </form>
    </div>
  );
}
