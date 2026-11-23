/**
 * Next's client instrumentation entry, loaded before the app hydrates.
 * Keep this file a list of re-exports: each hook's logic lives beside the
 * code it serves. If a second module needs `onRouterTransitionStart`,
 * define one function here that calls both modules' hooks in turn.
 *
 * `onRouterTransitionStart` types a browser Back, Forward or swipe for the
 * route transition (B05). See `components/app/traverse-transition.ts`.
 */
export { onRouterTransitionStart } from "./components/app/traverse-transition";
