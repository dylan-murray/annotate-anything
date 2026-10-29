import { annotateRoute } from "annotate-anything/next";

export const { GET, POST, OPTIONS } = annotateRoute({ dir: process.env.AA_DIR });
