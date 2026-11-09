// /back-bar.js and /back-bar.css: the one top bar (back-bar.ts) for the pages that are not Wayfinch's app, the bag planner and the legal
// pages, each loading both with `defer`. Built by tools/build-legal.mjs (writeBackBar) with the launch switch on; a plain script.
import './back-bar.css';
import { watchBar } from './back-bar.ts';

for (const bar of document.querySelectorAll<HTMLElement>('.wf-bar')) watchBar(bar);
