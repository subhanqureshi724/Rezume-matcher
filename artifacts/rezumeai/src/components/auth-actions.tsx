import { Show, useClerk } from '@clerk/react';
import { useLocation } from 'wouter';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function AuthActions() {
  const [, setLocation] = useLocation();
  const { signOut } = useClerk();

  return (
    <div className="auth-actions">
      <Show when="signed-out">
        <button className="auth-link" type="button" onClick={() => setLocation('/sign-in')}>Sign in</button>
        <button className="auth-signup" type="button" onClick={() => setLocation('/sign-up')}>Create account</button>
      </Show>
      <Show when="signed-in">
        <button className="auth-link" type="button" onClick={() => void signOut({ redirectUrl: basePath || '/' })}>Sign out</button>
      </Show>
    </div>
  );
}