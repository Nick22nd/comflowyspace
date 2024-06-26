import { PreviewImage } from "./comfy-props.types";
import { ComfyUIWorkflowGroup, ComfyUIWorkflowNode, PersistedWorkflowNode } from "./comfy-node.types";
import { JSONDocMeta } from "../jsondb/jsondb.types";
import { ComfyUIWorkflowConnection, PersistedWorkflowConnection } from "./comfy-connection.types";
import { ControlBoardConfig } from "./comflowy-controlboard.types";

export type ComfyUIRunFPMode = "normal" | "fp16" | "fp32";
export type ComfyUIRunVAEMode = "normal" | "fp16" | "fp32";
export enum ComfyUIRunPreviewMode {
  NoPreviews = "none",
  Auto = "auto",
  Latent2RGB = "latent2rgb",
  TAESD = "taesd",
}

export type ComfyUIRunConfig = {
  fpmode: ComfyUIRunFPMode;
  vaemode: ComfyUIRunVAEMode;
  previewMode: ComfyUIRunPreviewMode;
  extraCommand: string;
  condaEnv: string;
  autoInstallDeps?: boolean
}

export type PersistedFullWorkflow = {
  title: string;
  id: string;
  meta?: {
    sharedAsSubflow?: boolean;
    shareAsSubflowTitle?: string;
    sharedAsApp?: boolean;
    sharedAsApi?: boolean;
  };
  thumbnail?: string;
  gallery?: PreviewImage[];
  snapshot: Pick<PersistedWorkflowDocument, "nodes" | "controlboard" | "connections">; // json format
  [_: string]: any;
} & JSONDocMeta

export type PersistedWorkflowDocument = {
  id: string;
  title: string;
  nodes: Record<string, PersistedWorkflowNode>;
  connections: PersistedWorkflowConnection[];
  controlboard?: ControlBoardConfig;
  extra?: any;
  config?: any;
  last_link_id?: string;
  last_node_id?: string;
  version?: number;
  groups?: any[];
}

export type ComfyUIWorkflow = {
  id?: string;
  title?: string;
  nodes: ComfyUIWorkflowNode[];
  links: ComfyUIWorkflowConnection[];
  groups: ComfyUIWorkflowGroup[];
  version: number;
  config: any;
  extra: any;
}