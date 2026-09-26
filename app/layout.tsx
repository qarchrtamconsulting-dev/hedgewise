import "./globals.css";
import TopBar from "@/components/TopBar";

export const metadata = {
  title: "Hedgewise",
  description: "Promo arbitrage command center",
};

// Applies the saved theme before first paint so there is no flash.
const themeScript = `(function(){try{var t=localStorage.getItem("hw-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","dark")}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <TopBar />
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
