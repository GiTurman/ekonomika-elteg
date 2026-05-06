import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KLEEMANN | ლიფტის კალკულატორი" },
      { name: "description", content: "KLEEMANN Calculator Pro — ლიფტებისა და ესკალატორების ეკონომიკური კალკულატორი" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <iframe
      src="/calc.html"
      title="KLEEMANN Calculator"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: 0 }}
    />
  );
}
