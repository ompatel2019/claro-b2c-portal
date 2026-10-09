import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { LinkTabs } from "./link-tabs";

it("distinguishes unavailable counts from zero and omitted counts", () => {
  render(
    <LinkTabs
      label="Question status"
      active="live"
      tabs={[
        { value: "live", label: "Live", count: 0, href: "?status=live" },
        {
          value: "review",
          label: "Import review",
          count: null,
          href: "?status=review",
        },
        { value: "draft", label: "Draft", href: "?status=draft" },
      ]}
    />,
  );
  expect(screen.getByRole("link", { name: "Live (0)" })).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Import review (count unavailable)" }),
  ).toBeVisible();
  expect(screen.getByTitle("Count unavailable")).toHaveTextContent("(?)");
  expect(screen.getByRole("link", { name: "Draft" })).toBeVisible();
});
