export function generateTaskId(serviceId: string, label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "").slice(0, 40);
  const ts = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  return `${serviceId}-${slug}-${ts}`;
}
