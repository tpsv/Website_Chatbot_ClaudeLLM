import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ChatWidget } from "./components/ChatWidget";
import "./index.css";

document.querySelectorAll("[data-open-chat]").forEach((el) => {
  el.addEventListener("click", () => window.dispatchEvent(new Event("open-chat-widget")));
});

const elem = document.getElementById("chat-widget-root")!;
const app = (
  <StrictMode>
    <ChatWidget />
  </StrictMode>
);

if (import.meta.hot) {
  const root = (import.meta.hot.data.root ??= createRoot(elem));
  root.render(app);
} else {
  createRoot(elem).render(app);
}
