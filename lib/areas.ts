import dataset from "./data/areas.json";
import type { Area, DatasetMetadata } from "./types";

export const DATASET_META = dataset.metadata as DatasetMetadata;
export const AREAS = dataset.areas as Area[];
