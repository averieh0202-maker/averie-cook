import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ownerLogin } from "../lib/api";
import { useAuth } from "../lib/auth";
import { copy } from "../lib/copy";

export function LoginPage() {
  const { owner, refresh, logout } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await ownerLogin(password);
      await refresh();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.loadError);
    } finally {
      setBusy(false);
    }
  }

  if (owner) {
    return (
      <div className="space-y-4 py-8 text-center">
        <p className="font-serif text-xl">已经登录为站长</p>
        <p className="text-sm text-mute">完整食谱现在会显示在详情页。</p>
        <div className="flex justify-center gap-4">
          <Link to="/" className="text-clay">
            去档案
          </Link>
          <button
            type="button"
            className="text-mute"
            onClick={() => {
              void logout();
            }}
          >
            {copy.btn.logout}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="font-serif text-2xl">{copy.btn.login}</h1>
      <p className="mt-2 text-sm text-mute">{copy.loginHint}</p>
      <form className="mt-6 space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <label className="block text-sm">
          密码
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-line bg-card px-3 py-2 outline-none ring-clay focus:ring-2"
          />
        </label>
        {error ? <p className="text-sm text-clay">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded-2xl bg-clay py-2.5 font-medium text-white disabled:opacity-50"
        >
          进入
        </button>
      </form>
      <Link to="/" className="mt-6 inline-block text-sm text-mute">
        ← {copy.btn.back}
      </Link>
    </div>
  );
}
