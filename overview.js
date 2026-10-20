// Overview page: static links to the connection checks; only the tool versions are filled in.
import { CONNECTIONS_VERSION, TOOL_VERSION } from "./lib/index.js";

document.querySelector("[data-version]").textContent = `Tool versions ${TOOL_VERSION}, ${CONNECTIONS_VERSION}`;
