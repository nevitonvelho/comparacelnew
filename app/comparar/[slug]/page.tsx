import { Comparison } from "../../components/comparison";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; return <Comparison slug={slug} />; }
