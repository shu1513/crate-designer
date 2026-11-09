/** Messages between the UI and the design worker. Module 1 only echoes. */
export type WorkerRequest = { type: "echo"; payload: string };
export type WorkerResponse = { type: "echo"; payload: string };
