import { NavLink, Outlet, useLocation } from "react-router-dom";
import { copy } from "../lib/copy";
import { useAuth } from "../lib/auth";

const tabs = [
  { to: "/", label: copy.nav.cooked, end: true },
  { to: "/want-cook", label: copy.nav.wantCook },
  { to: "/want-eat", label: copy.nav.wantEat },
];

export function Layout() {
  const { owner, logout } = useAuth();
  const loc = useLocation();
  const hideNav = loc.pathname.startsWith("/login");

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line/70 bg-paper/90 px-4 py-3 backdrop-blur">
        <NavLink to="/" className="font-serif text-lg text-ink">
          {copy.brand}
        </NavLink>
        {owner ? (
          <button type="button" className="text-sm text-mute" onClick={() => void logout()}>
            {copy.btn.logout}
          </button>
        ) : (
          <NavLink to="/login" className="text-sm text-clay">
            {copy.btn.login}
          </NavLink>
        )}
      </header>
      <main className="flex-1 px-4 pb-28 pt-4">
        <Outlet />
      </main>
      {hideNav ? null : (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line/80 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto grid max-w-lg grid-cols-3">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `py-3 text-center text-sm ${isActive ? "font-semibold text-clay" : "text-mute"}`
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
