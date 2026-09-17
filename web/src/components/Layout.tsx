import { NavLink, Outlet, useLocation } from "react-router-dom";
import { copy } from "../lib/copy";
import { useAuth } from "../lib/auth";

const tabs = [
  { to: "/", label: copy.nav.cooked, end: true },
  { to: "/want-cook", label: copy.nav.wantCook },
  { to: "/want-eat", label: copy.nav.wantEat },
];

export function Layout() {
  const { owner, rater, logout, logoutRater } = useAuth();
  const loc = useLocation();
  const hideNav = loc.pathname.startsWith("/login");

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-paper px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <NavLink to="/" className="font-serif text-[1.35rem] tracking-wide text-ink">
            {copy.brand}
          </NavLink>
          <div className="flex min-w-0 items-baseline gap-2">
            {rater ? (
              <span className="max-w-[7.5rem] truncate text-sm tracking-wide text-ink/80" title={rater.displayName}>
                {rater.displayName}
              </span>
            ) : null}
            {owner ? (
              <button type="button" className="shrink-0 text-sm tracking-wide text-mute" onClick={() => void logout()}>
                {copy.btn.logout}
              </button>
            ) : rater ? (
              <button type="button" className="shrink-0 text-sm tracking-wide text-mute" onClick={() => logoutRater()}>
                {copy.btn.logout}
              </button>
            ) : (
              <NavLink to="/login" className="shrink-0 text-sm tracking-wide text-clay">
                {copy.btn.login}
              </NavLink>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 px-3 pb-28 pt-5 sm:px-4">
        <Outlet />
      </main>
      {hideNav ? null : (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line/80 bg-card pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto grid max-w-lg grid-cols-3">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `py-3.5 text-center text-[13px] tracking-wide ${isActive ? "font-semibold text-clay" : "text-mute"}`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
