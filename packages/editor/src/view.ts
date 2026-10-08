import { Message, type Model } from "@foldkit-mde/core";
import type { Html, HtmlBuilder } from "foldkit/html";

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.Class("mde"), h.AriaLabel("Markdown editor")],
    [
      h.label(
        [h.Class("mde-canvas")],
        [
          h.span([h.Class("mde-label")], ["Markdown source"]),
          h.textarea([
            h.Class("mde-source"),
            h.AriaLabel("Markdown source"),
            h.Value(model.source),
            h.OnInput((source) => Message.cases.UpdatedSource.make({ source })),
            h.Placeholder("Start writing..."),
            h.Spellcheck(true),
            h.Rows(18),
          ]),
        ],
      ),
      h.div(
        [h.Class("mde-status")],
        [
          h.span([], ["Plain Markdown. Your words stay yours."]),
          h.span([], [`${model.source.length.toLocaleString()} characters`]),
        ],
      ),
    ],
  );
