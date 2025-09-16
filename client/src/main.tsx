import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setupGlobalErrorHandling } from "./lib/errorHandling";

// Set up global error handling
setupGlobalErrorHandling();

createRoot(document.getElementById("root")!).render(<App />);
