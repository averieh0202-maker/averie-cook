import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ownerLogin } from "../lib/api";
import { useAuth } from "../lib/auth";
import { copy } from "../lib/copy";

export function LoginPage() {
  const { owner, rater, refresh, logout, loginRater, logoutRater } = useAuth();
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ownerBusy, setOwnerBusy] = useState(false);
  const navigate = useNavigate();

  async function onAccountSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginRater(displayName, pin);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.loadError);
    } finally {
      setBusy(false);
    }
  }

  async function onOwnerSubmit(e: FormEvent) {
    e.preventDefault();
    setOwnerBusy(true);
    setOwnerError(null);
    try {
      await ownerLogin(password);
      await refresh();
      navigate("/");
    } catch (err) {
      setOwnerError(err instanceof Error ? err.message : copy.loadError);
    } finally {
      setOwnerBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-10 px-1 py-8">
      <section>
        <h1 className="font-serif text-2xl tracking-wide">{copy.account.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-mute">{copy.account.hint}</p>
        {rater ? (
          <div className="mt-5 space-y-3 rounded-2xl bg-card px-4 py-4">
            <p className="text-sm">{copy.account.loggedIn(rater.displayName)}</p>
            <div className="flex gap-4">
              <Link to="/" className="text-clay">
                去档案
              </Link>
              <button type="button" className="text-mute" onClick={() => logoutRater()}>
                {copy.btn.logout}
              </button>
            </div>
          </div>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={(e) => void onAccountSubmit(e)}>
            <label className="block text-sm">
              {copy.account.name}
              <input
                type="text"
                name="nickname"
                autoComplete="nickname"
                maxLength={16}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-line bg-card px-3 py-2 outline-none ring-clay focus:ring-2"
              />
            </label>
            <label className="block text-sm">
              {copy.account.pin}
              <input
                type="password"
                name="pin"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                pattern="\d{4,6}"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="mt-1 w-full rounded-2xl border border-line bg-card px-3 py-2 outline-none ring-clay focus:ring-2"
              />
            </label>
            {error ? <p className="text-sm text-clay">{error}</p> : null}
            <button
              type="submit"
              disabled={busy || !displayName.trim() || pin.length < 4}
              className="w-full rounded-2xl bg-clay py-2.5 font-medium text-white disabled:opacity-50"
            >
              {copy.btn.register}
            </button>
            <p className="text-xs leading-relaxed text-mute">{copy.account.skip}</p>
          </form>
        )}
      </section>

      <section className="border-t border-line/80 pt-8">
        <h2 className="font-serif text-xl tracking-wide">{copy.btn.loginOwner}</h2>
        <p className="mt-2 text-sm leading-relaxed text-mute">{copy.loginHint}</p>
        {owner ? (
          <div className="mt-5 space-y-3">
            <p className="font-serif text-lg">已经登录为站长</p>
            <p className="text-sm text-mute">完整食谱现在会显示在详情页。</p>
            <div className="flex gap-4">
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
        ) : (
          <form className="mt-5 space-y-4" onSubmit={(e) => void onOwnerSubmit(e)}>
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
            {ownerError ? <p className="text-sm text-clay">{ownerError}</p> : null}
            <button
              type="submit"
              disabled={ownerBusy || !password}
              className="w-full rounded-2xl border border-clay/40 bg-card py-2.5 font-medium text-clay disabled:opacity-50"
            >
              进入
            </button>
          </form>
        )}
      </section>

      <Link to="/" className="inline-block text-sm text-mute">
        ← {copy.btn.back}
      </Link>
    </div>
  );
}
