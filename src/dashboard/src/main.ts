import { mount } from "svelte";
import App from "./App.svelte";
import "@xyflow/svelte/dist/style.css";
import "./workspace.css";

mount(App, { target: document.getElementById("root")! });
