import { Link, NavLink, Outlet } from "react-router";

export default function RootLayout() {
  return (
    <div className="isolate relative min-h-svh bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <nav className="mx-auto flex max-w-4xl items-center gap-6">
          <Link to="/" className="text-sm font-semibold tracking-tight">
            My App
          </Link>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              [
                "text-sm transition-colors",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")
            }
          >
            Home
          </NavLink>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
