import { init, Model, type Message, update } from "@foldkit-mde/core";
import { view as editorView } from "@foldkit-mde/editor";
import { Runtime } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";

const source = `# Late-night frequencies

A place for the tracks that stay with you.

## Notes from the booth

Start with a slow build. Leave space between the records.

- Warm textures
- A little tension
- One unexpected turn

> The best part is the bit you didn't plan.
`;

const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: "Foldkit MDE | Playground",
  body: h.main(
    [h.Class("playground")],
    [
      h.header(
        [h.Class("playground-header")],
        [
          h.p([h.Class("eyebrow")], ["FOLDKIT / EFFECT / MARKDOWN"]),
          h.h1([], ["Make room for the words."]),
          h.p([h.Class("intro")], ["A small editor, built from the source outward."]),
        ],
      ),
      editorView(model, h),
      h.footer(
        [h.Class("playground-footer")],
        [
          h.span([], ["foldkit-mde / 0.0.0"]),
          h.span([], ["Source-only scaffold. Changes are not saved."]),
        ],
      ),
    ],
  ),
});

Runtime.run(
  Runtime.makeApplication({
    Model,
    init: () => ({ model: init(source), commands: [] }),
    update: (model, message) => ({ model: update(model, message), commands: [] }),
    view,
    container: document.getElementById("root"),
  }),
);
