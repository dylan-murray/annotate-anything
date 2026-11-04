import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { annotate, type AnnotateOptions } from "./index.js";

export type AnnotateProps = AnnotateOptions;

// Next.js App Router: put <Annotate /> in app/layout.tsx. It talks to the
// annotateRoute() handler at /api/annotate and jumps between notes with the router.
export function Annotate(props: AnnotateProps) {
  const router = useRouter();
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && !props.enabled) return;
    const tool = annotate({ endpoint: "/api/annotate", navigate: (route) => router.push(route), ...props });
    return () => tool.destroy();
  }, []);
  return null;
}

export default Annotate;
