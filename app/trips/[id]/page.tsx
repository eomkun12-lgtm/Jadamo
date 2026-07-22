import OceanTripTemplate from "../ishigaki-2026/page";

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OceanTripTemplate tripId={id} />;
}
