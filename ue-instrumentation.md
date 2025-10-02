## Universal Editor instrumentation for existing Edge Delivery blocks

This guide explains how to instrument existing Edge Delivery blocks to work with Universal Editor (UE) using this boilerplate. It’s written for teams moving from SharePoint (or other sources) to `da.live` with UE.

### What UE does (high level)
- **Blocks stay clean**: your block JS renders DOM normally. You don’t add `data-aue-*` yourself.
- **NX/UE injects attributes**: when a page is opened in UE, the NX service computes a mapping from DOM to AEM resources and injects attributes like `data-aue-resource`, `data-aue-model`, `data-aue-prop`, and for asset fields `data-aue-reference`.
- **Runtime adapter keeps attributes aligned**: if your block transforms DOM (e.g., wraps nodes, replaces elements), a small UE adapter moves the injected attributes to the new nodes so the editor keeps working.

### Prerequisites
- A site accessible via `da.live` and a page you can open in Universal Editor.
- UE enabled for your org, and you can reach the editor domain (e.g., `ue.da.live`).

## Migration checklist (what you actually do)

### 1) Model your components and fields
Create or update UE model files under `ue/models/**`:

- Add a component to the palette via `ue/models/component-definition.json` (or keep using the root `component-definition.json` if you prefer the flat form).
- Define editable fields and their DOM mapping in `ue/models/blocks/<your-block>.json` using CSS selectors. Common field components:
  - `richtext`: map to an element that contains the text HTML.
  - `reference`: map to an asset reference (e.g., an `img[src]`); UE will inject `data-aue-reference` on the target node.
  - `text`, `multiselect`, etc., for simple properties.
- If your block is a container (e.g., Cards, Accordion), define a `filters` entry that enumerates which child components it can contain.

Example (Card fields):
```json
{
  "id": "card",
  "fields": [
    {
      "component": "reference",
      "valueType": "string",
      "name": "div:nth-child(1)>picture:nth-child(1)>img:nth-child(3)[src]",
      "label": "Image"
    },
    {
      "component": "text",
      "valueType": "string",
      "name": "div:nth-child(1)>picture:nth-child(1)>img:nth-child(3)[alt]",
      "label": "Image Alt"
    },
    {
      "component": "richtext",
      "name": "div:nth-child(2)",
      "label": "Text",
      "valueType": "string"
    }
  ]
}
```

Tips for selectors:
- Point selectors at the DOM as it appears after your block decorates itself.
- For images, target the actual `img[src]` and `[alt]`. Use `component: "reference"` for the `src` to get `data-aue-reference`.
- For rich text, target the element that should be editable as HTML (UE adds rich text handling).

### 2) Register block(s) in the component palette
- In `ue/models/component-definition.json`, ensure your block has a `definition` with a title and either a `name` (rows/columns) or a minimal `unsafeHTML` scaffold.
- If it’s a container, add a `filters` entry to list valid children.

### 3) Ensure the UE adapter runs in editor
The boilerplate already loads the adapter when running under the UE domain. You don’t need to change your blocks for this.

What the adapter does:
- Observes DOM mutations in known transforming blocks (e.g., Cards, Accordion, Carousel).
- When a node is replaced or moved during decoration, it copies all `data-aue-*` attributes to the new node.
- Responds to UE selection events (`aue:ui-select`) to display the selected UI state (e.g., open the right accordion item, change carousel slide, switch tabs).

If you have a custom block that heavily mutates DOM and isn’t covered yet:
- Add a small case in `ue/scripts/ue.js` to detect the mutation and call the shared helper `moveInstrumentation(from, to)` for the relevant elements.
- This keeps the UE attributes aligned after your transformations.

### 4) Test in Universal Editor
1. Open the page in UE (editor domain).
2. Inspect elements and confirm UE has added attributes on instances and fields:
   - `data-aue-resource` on the component instance root.
   - `data-aue-model` with your block’s model id.
   - `data-aue-prop` / rich text flags on inline fields.
   - `data-aue-reference` on asset fields (e.g., images declared as `reference`).
3. Select components/fields in the left panel; the adapter should reflect state in the page (open accordion item, show slide, etc.).

## Practical patterns

### Mapping rich text
- Use `component: "richtext"` and map to the element that should be editable as HTML.
- UE will handle editing and inject the appropriate `data-richtext-*` flags.

### Mapping images (assets)
- Use `component: "reference"` on the `img[src]` selector.
- Add a companion `text` field mapped to `img[alt]`.
- UE injects `data-aue-reference` so the editor knows which AEM asset node to update.

### Container blocks
- Define a parent model (e.g., `cards`) and a child model (e.g., `card`).
- In the parent’s `filters`, list `components: ["card"]`.
- The adapter already covers common container transforms (e.g., replacing inner wrappers with lists or details/summary).

### Block options via classes
- For style/options switches, map a `text` or `select` to a `classes` field and apply classes in your block rendering.
- You can also split options across `classes_*` fields and compose them in render.

## Minimal changes in block JS
- Keep rendering logic as-is; do not hardcode `data-aue-*`.
- If your block replaces DOM nodes post-render, ensure the adapter knows how to move instrumentation for your case (most common ones are already implemented). For custom cases, call the shared helper to copy attributes from old to new nodes.

## Common pitfalls
- **Unstable selectors**: make sure your field selectors match the post-decoration DOM consistently.
- **Deep wrappers**: if you wrap nodes during decoration, ensure selectors point to the final element (e.g., the `img` itself, not an ancestor).
- **Async rendering**: if your block loads content async, the adapter’s mutation observer will still move attributes, but your selectors in models must reflect the final structure.

## Verifying what UE planned
- In the browser devtools Network tab, inspect the `/nx/details` request while in UE. It shows how NX mapped your models and fields to DOM and which AEM resources they target.

## Where to look in this boilerplate
- UE adapter: `ue/scripts/ue.js` and `ue/scripts/ue-utils.js` (mutation handling and selection sync).
- Component palette and models:
  - Aggregators: `ue/models/component-definition.json`, `ue/models/component-models.json`, `ue/models/component-filters.json`.
  - Block models: `ue/models/blocks/*.json` (per-block definitions, fields, filters).
- App bootstrap: `scripts/scripts.js` (loads the UE adapter automatically under the UE domain).

That’s it. Model your blocks with selectors, rely on the adapter to keep attributes aligned, and test in UE. You should not need to rewrite your blocks—just describe them for UE and, if needed, add a tiny mutation case in the adapter for highly custom DOM changes.


