import { useEffect } from "react";
import { annotate, type AnnotateOptions } from "./index.js";

export type AnnotateProps = AnnotateOptions;

// Mount once near the root of a React app: <Annotate endpoint="/__annotate" />.
// It renders nothing and does nothing outside development.
export function Annotate(props: AnnotateProps) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && !props.enabled) return;
    const tool = annotate(props);
    return () => tool.destroy();
  }, []);
  return null;
}

export default Annotate;
