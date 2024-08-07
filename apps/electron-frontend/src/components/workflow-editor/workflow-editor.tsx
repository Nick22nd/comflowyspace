import * as React from 'react'
import styles from "./workflow-editor.style.module.scss";
import {useAppStore} from "@comflowy/common/store";
import ReactFlow, { Background, BackgroundVariant, Controls, NodeProps, OnConnectStartParams, Panel, SelectionMode, useStore, useStoreApi, Node, getNodesBounds, ReactFlowInstance, useUpdateNodeInternals, Edge} from 'reactflow';
import { NodeWrapper } from './reactflow-node/reactflow-node-wrapper';
import { NODE_IDENTIFIER } from './reactflow-node/reactflow-node';
import { WsController } from './websocket-controller/websocket-controller';
import { Input, NODE_GROUP, NODE_PRIMITIVE, PersistedFullWorkflow, PersistedWorkflowDocument, SDNode, Widget } from '@comflowy/common/types';
import ReactflowBottomCenterPanel from './reactflow-bottomcenter-panel/reactflow-bottomcenter-panel';
import ReactflowTopLeftPanel from './reactflow-topleft-panel/reactflow-topleft-panel';
import ReactflowTopRightPanel from './reactflow-topright-panel/reactflow-topright-panel';
import { useRouter } from 'next/router';
import { documentDatabaseInstance } from '@comflowy/common/storage';
import { shallow } from 'zustand/shallow';
import ContextMenu from './reactflow-context-menu/reactflow-context-menu';
import { JSONDBClient } from '@comflowy/common/jsondb/jsondb.client';
import { copyNodes, pasteNodes } from './reactflow-clipboard';
import { ReactflowExtensionController } from '@/lib/extensions/extensions.controller';
import { WidgetTreeOnPanel, WidgetTreeOnPanelContext } from './reactflow-bottomcenter-panel/widget-tree/widget-tree-on-panel-click';
import { onEdgeUpdateFailed } from './reactflow-connecting';
import { useExtensionsState } from '@comflowy/common/store/extension-state';
import { message } from 'antd';
import { MissingWidgetsPopoverEntry } from './reactflow-missing-widgets/reactflow-missing-widgets';
import { GroupNode } from './reactflow-group/reactflow-group';
import { isRectContain } from "@comflowy/common/utils/math";
import { loadI18NFromExtension } from './reactflow-i18n/use-flow-i18n';
import { ReplaceNodeSuggestionModal } from './reactflow-node/reactflow-node-suggestion';

const nodeTypes = { 
  [NODE_IDENTIFIER]: NodeWrapper,
  [NODE_GROUP]: GroupNode
}

export default function WorkflowEditor() {
  /**
   * basic properties
   */
  const [inited, setInited] = React.useState(false);
  const ref = React.useRef(null);
  const storeApi = useStoreApi();
  const { id, watchedDoc } = useLiveDoc(inited);
  const [reactFlowInstance, setReactFlowInstance] = React.useState<ReactFlowInstance>(null);
  const onInitExtensionState = useExtensionsState((st) => st.onInit);
  const [toolsUIVisible, setToolsUIVisible] = React.useState(false);
  React.useEffect(() => {
    if (ref.current) {
      setToolsUIVisible(true);
    }
  }, [ref])

  const edgeUpdateSuccessful = React.useRef(true);
  const edgetConnectSuccessful = React.useRef(true);
  const edgeConnectingParams = React.useRef<OnConnectStartParams>(null);
  const edgeUpdating = React.useRef(false);

  /**
   * core behaviors
   */
  useCopyPaste(ref, reactFlowInstance);
  const { menu, setMenu, onSelectionContextMenu } = useWorkflowNodeContextMenu(ref);
  const { widgetTreeContext, setWidgetTreeContext, onPanelDoubleClick, onPanelClick } = useWorkflowPanelContextMenu(edgeUpdating);
  const { onNodeDrag, onNodeDragStart, onNodeDragStop, onSelectionChange} = useDragDropNode(ref);
  const { onPaneDragOver, onPaneDrop } = useDragDropToCreateNode(reactFlowInstance, setWidgetTreeContext);

  const edges = useAppStore(st => st.edges);
  const nodes = useAppStore(st => st.nodes);
  const widgets = useAppStore(st => st.widgets);
  const transform = useAppStore(st => st.transform);
  const inprogressNodeId = useAppStore(st => st.nodeInProgress?.id);
  const selectionMode = useAppStore(st => st.slectionMode);
  /**
   * app state
   */
  const { onTransformStart, onTransformEnd, onConnectStart, onConnectEnd, onDeleteNodes, onEdgesDelete,onNodesChange, onEdgesChange, onEdgesUpdate, onEdgeUpdateStart, onEdgeUpdateEnd, onConnect, onInit, onNewClientId} = useAppStore((st) => ({
    onNewClientId: st.onNewClientId,
    onEdgesUpdate: st.onEdgeUpdate,
    onEdgeUpdateStart: st.onEdgeUpdateStart,
    onEdgeUpdateEnd: st.onEdgeUpdateEnd,
    onDeleteNodes: st.onDeleteNodes,
    onConnectStart: st.onConnectStart,
    onConnectEnd: st.onConnectEnd,
    onEdgesDelete: st.onEdgesDelete,
    onNodesChange: st.onNodesChange,
    onEdgesChange: st.onEdgesChange,
    onLoadWorkflow: st.onLoadWorkflow,
    onTransformEnd: st.onTransformEnd,
    onTransformStart: st.onTransformStart,
    onConnect: st.onConnect,
    onInit: st.onInit,
  }), shallow)

  /**
   * node and edge rendering 
   */
  const { nodesWithStyle, styledEdges } = useNodeAndEdgesWithStyle(nodes, edges, inprogressNodeId, transform);
  
  const tranformEnd = React.useCallback(() => {
    const transform = storeApi.getState().transform;
    onTransformEnd(transform[2]);
  }, []);

  const onPaneClick = React.useCallback(() => {
    tranformEnd();
    setMenu(null)
  }, [setMenu]);


  const updateNodeInternals = useUpdateNodeInternals();

  if (inited && watchedDoc && watchedDoc.deleted) {
    return <div>This doc is deleted</div>
  }

  return (
    <div className={styles.workflowEditor}>
      {id && id !== "" && <WsController clientId={id as string}/>}
      <ReactFlow
        ref={ref}
        nodes={nodesWithStyle}
        edges={styledEdges}
        maxZoom={10}
        minZoom={.1}
        fitView
        nodeTypes={nodeTypes}
        deleteKeyCode={['Delete', 'Backspace']}
        disableKeyboardA11y={true}
        zoomOnDoubleClick={false}
        onDoubleClick={onPanelDoubleClick}
        onClick={onPanelClick}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodesDelete={onDeleteNodes}
        onEdgesDelete={edges => {
          onEdgesDelete(edges);
          const st = useAppStore.getState();
          edges.forEach(edge => {
            const source = edge.source;
            const sourceNode = st.graph[source];
            if (sourceNode && sourceNode.widget === NODE_PRIMITIVE) {
              updateNodeInternals(source);
            }
          })
        }}
        onEdgeUpdateStart={() => {
          edgeUpdateSuccessful.current = false;
          edgeUpdating.current = true;
          onEdgeUpdateStart();
        }}
        onEdgeUpdate={(oldEdge, newConnection) => {
          edgeUpdateSuccessful.current = true;
          onEdgesUpdate(oldEdge, newConnection);
        }}
        onEdgeUpdateEnd={(event: MouseEvent, edge) => {
          onEdgeUpdateEnd(event, edge, edgeUpdateSuccessful.current);
          if (!edgeUpdateSuccessful.current) {
            onEdgesDelete([edge]);
            const connectingParams = edgeConnectingParams.current;
            if (connectingParams) {
              onEdgeUpdateFailed({
                event,
                nodes,
                onConnect,
                widgets,
                setWidgetTreeContext,
                connectingParams
              })
            }
          }
          setTimeout(() => {
            edgeUpdating.current = false;
          }, 100)
        }}
        onConnectStart={(ev, params)=> {
          edgeConnectingParams.current = params;
          edgeUpdating.current = true;
          edgetConnectSuccessful.current = false;
          onConnectStart(ev, params); 
        }}
        onConnect={(connection) => {
          edgetConnectSuccessful.current = true;
          onConnect(connection);
        }}
        onConnectEnd={(ev: MouseEvent) => {
          onConnectEnd(ev);
          if (!edgetConnectSuccessful.current) {
            onEdgeUpdateFailed({
              event: ev,
              nodes,
              onConnect,
              widgets,
              setWidgetTreeContext,
              connectingParams: edgeConnectingParams.current
            })
          }
          setTimeout(() => {
            edgeConnectingParams.current = null;
            edgetConnectSuccessful.current = true;
            edgeUpdating.current = false;
          }, 100)
        }}
        onDrop={onPaneDrop}
        onDragOver={onPaneDragOver}
        onMoveStart={ev => {
          onTransformStart();
        }}
        onMoveEnd={tranformEnd}
        onPaneClick={onPaneClick}
        onNodeContextMenu={(ev, node) => {
          onSelectionContextMenu(ev, [node]);
        }}
        onSelectionContextMenu={onSelectionContextMenu}
        onPaneContextMenu={onPaneClick}
        {...useSelectionModeRelatedProps(selectionMode)}
        onNodeDrag={onNodeDrag}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onSelectionChange={(ev) => {
          /**
           * Track multiple node dragging
           */
          if (ev.nodes.length > 0) {
            onSelectionChange(ev);
          }
        }}
        onInit={async (instance) => {
          try {
            setReactFlowInstance(instance);
            await loadI18NFromExtension();
            await onInitExtensionState(false);
            await onInit(instance);
            if (id) {
              onNewClientId(id as string);
            }
            setInited(true);

            setTimeout(() => {
              const transform = storeApi.getState().transform;
              onTransformEnd(transform[2]);
            }, 1000)
          } catch(err) {
            message.error("App init failed: " + err.message);
          }
        }}
      >
        <Background variant={BackgroundVariant.Dots} />
        {toolsUIVisible && (
          <>
            <Controls />
            <Panel position="bottom-center">
              <ReactflowBottomCenterPanel/>
            </Panel>
            <Panel position="top-left">
              <ReactflowTopLeftPanel/>
            </Panel>
            <Panel position="top-right">
              <ReactflowTopRightPanel/>
            </Panel>
          </>
        )}
        {menu && <ContextMenu hide={onPaneClick} {...menu} />}
      </ReactFlow>
      <ReactflowExtensionController/>
      { widgetTreeContext && <WidgetTreeOnPanel context={widgetTreeContext}/>}
      <MissingWidgetsPopoverEntry/>
      <ReplaceNodeSuggestionModal/>
    </div>
  )
}

function useSelectionModeRelatedProps(selectionMode) {
  return selectionMode === "figma" ? {
    selectionOnDrag: true,
    panOnScroll: true,
    panOnDrag: [1, 2],
    selectionMode: SelectionMode.Partial
  } : {};
}

function useNodeAndEdgesWithStyle(nodes: Node[], edges: Edge[], inprogressNodeId, transform) {
  const graph = {};
  const edgeType = useAppStore(st => st.edgeType);
  const nodesWithStyle = nodes.map(node => {
    graph[node.id] = node;
    return {
      ...node,
      style: {
        ...node.style,
        width: node.width,
        height: node.height
      }
    }
  });

  const styledEdges = edges.map(edge => {
    let finalType = edgeType || 'default';
    if (edgeType === "bezier") {
      finalType = "default"
    }
    const targetNode = graph[edge.target];
    const sourceNode = graph[edge.source];
    let edgeSelect = edge.selected;
    if ((targetNode && targetNode.selected) || (sourceNode && sourceNode.selected)) {
      edgeSelect = true;
    }
    return {
      ...edge,
      type: finalType,
      animated: edge.source === inprogressNodeId,
      style: {
        strokeWidth: (edgeSelect ? 3.5 : 2) / transform,
        opacity: edgeSelect ? 1 : .6,
        stroke: Input.getInputColor([edge.sourceHandle] as any),
      },
    }
  });

  return {
    nodesWithStyle,
    styledEdges
  }

}

/**
 * workfow node context menu
 */

function useWorkflowNodeContextMenu(ref) {
  const [menu, setMenu] = React.useState(null);
  const onSelectionContextMenu = React.useCallback(
    (event, nodes) => {
      // Prevent native context menu from showing
      event.preventDefault();

      // Calculate position of the context menu. We want to make sure it
      // doesn't get positioned off-screen.
      const pane = ref.current.getBoundingClientRect();
      setMenu({
        nodes,
        top: event.clientY < pane.height - 200 && event.clientY,
        left: event.clientX < pane.width - 200 && event.clientX,
        right: event.clientX >= pane.width - 200 && pane.width - event.clientX,
        bottom:
          event.clientY >= pane.height - 200 && pane.height - event.clientY,
      });
    },
    [setMenu],
  );

  return {
    menu,
    setMenu,
    onSelectionContextMenu
  }
}

/**
 * workflow panel context menu
 */
function useWorkflowPanelContextMenu(edgeUpdating) {
  const [widgetTreeContext, setWidgetTreeContext] = React.useState<WidgetTreeOnPanelContext>();
  const onPanelDoubleClick = React.useCallback((ev: React.MouseEvent) => {
    const target = ev.target as HTMLElement;
    if (target.classList.contains("react-flow__pane")) {
      setWidgetTreeContext({
        position: {
          x: ev.clientX,
          y: ev.clientY
        },
        filter: (widget) => true,
        showCategory: true,
        onNodeCreated: () => {
          setWidgetTreeContext(null);
        }
      })
    }
  }, [setWidgetTreeContext]);

  const onPanelClick = React.useCallback((ev: React.MouseEvent) => {
    !edgeUpdating.current && setWidgetTreeContext(null)
  }, []);

  React.useEffect(() => {
    document.oncontextmenu = function () {
      return false;
    }
  }, []);
  return {
    widgetTreeContext,
    setWidgetTreeContext,
    onPanelDoubleClick,
    onPanelClick
  }
}

function useDragDropToCreateNode(reactFlowInstance, setWidgetTreeContext) {
  const widgets = useAppStore(st => st.widgets);
  const onAddNode = useAppStore(st => st.onAddNode);
  const onDragOver = React.useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);


  const onDrop = React.useCallback(
    async (event) => {
      event.preventDefault();
      try {
        const rawWidgetInfo = event.dataTransfer.getData('application/reactflow');
        const widgetInfo = JSON.parse(rawWidgetInfo) as Widget;
        const widgetType = widgetInfo.name;
        if (typeof widgetType === 'undefined' || !widgetType) {
          return;
        }
        // reactFlowInstance.project was renamed to reactFlowInstance.screenToFlowPosition
        // and you don't need to subtract the reactFlowBounds.left/top anymore
        // details: https://reactflow.dev/whats-new/2023-11-10
        const position = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        await onAddNode(widgetInfo, position);
        setWidgetTreeContext(null);
      } catch (err) {
        console.log("drop error", err);
      }
    },
    [reactFlowInstance, widgets],
  );

  return {
    onPaneDragOver: onDragOver,
    onPaneDrop: onDrop
  }

}

/**
 * live doc
 */
function useLiveDoc(inited) {
  const onLoadWorkflow = useAppStore(st => st.onLoadWorkflow);
  const router = useRouter();
  const { id } = router.query;
  const watchedDoc = JSONDBClient.useLiveDoc<PersistedFullWorkflow | null>({
    collectionName: "workflows",
    documentId: id as string,
    queryFn: async () => {
      if (!id) {
        return null;
      }
      return await documentDatabaseInstance.getDoc(id as string)
    }
  });
  React.useEffect(() => {
    if (id && inited) {
      documentDatabaseInstance.getDoc(id as string).then(doc => {
        doc && !doc.deleted && onLoadWorkflow(doc);
      }).catch(err => {
        console.log(err);
      })
    }
  }, [id, inited])
  return {id, watchedDoc}
}


/**
  * node drag enter and leave on group node
  * https://pro-examples.reactflow.dev/dynamic-grouping
  */
function useDragDropNode(ref) {
  const mousedownRef = React.useRef(false);
  const draggingRef = React.useRef(false);
  const selectionNodesRef = React.useRef<Node[]>([]);
  const onMouseDown = React.useCallback((ev: MouseEvent) => {
    mousedownRef.current = true;
  }, []);

  const onSelectionChange = React.useCallback((ev) => {
    const selectionNodes = (ev.nodes || []) as Node[];
    if (mousedownRef.current && selectionNodes.length > 0) {
      // if any of the selection node is a group type node, do nothing
      if (selectionNodes.find(n => n.type === NODE_GROUP)) {
        return
      }
      draggingRef.current = true;

      // calculate the bound for all nodes consider nodes are deleted
      const {nodes} = useAppStore.getState();
      // const realtimeNodes = selectionNodes.map(n => graph[n.id]);
      const realtimeNodes = selectionNodes.map(n => {
        const it = nodes.find(node => node.id === n.id);
        return {
          ...it,
          positionAbsolute: it.positionAbsolute || n.positionAbsolute
        };
      }).filter(n => !!n);

      if (realtimeNodes.length !== selectionNodes.length) {
        return
      }

      selectionNodesRef.current = realtimeNodes;
      
      const bound = getNodesBounds(realtimeNodes);

      const groupNodes = nodes.filter(n => n.type === NODE_GROUP);
      const groupNode = groupNodes.find(n => {
        const groupBound = getNodesBounds([n]);
        const ret = isRectContain(groupBound, bound);
        // console.log(ret, groupBound, bound, selectionNodes.map(n => n.id));
        return ret;
      });

      if (groupNode) {
        useAppStore.setState({
          draggingOverGroupId: groupNode.id
        })
      } else {
        useAppStore.setState({
          draggingOverGroupId: null
        })
      }
    }
  }, []);
  
  const onMouseUp = React.useCallback(() => {
    mousedownRef.current = false;
    const selectionNodes = selectionNodesRef.current;

    const st = useAppStore.getState();
    const draggingOverGroupId = st.draggingOverGroupId;
    if (draggingOverGroupId) {
      useAppStore.setState({
        draggingOverGroupId: null
      });
    }

    if (draggingRef.current) {
      draggingRef.current = false;
      
      if (selectionNodes.length === 0) {
        return;
      }

      const draggingOverGroup = st.nodes.find(n => n.id === draggingOverGroupId);
      selectionNodes.forEach(node => {
        const st = useAppStore.getState();
        const sdnode = node.data.value as SDNode;
        // console.log("sdnode", sdnode, sdnode.parent, draggingOverGroupId);
        /**
         * if node already in a group, then do nothing
         */
        if (sdnode.parent && sdnode.parent === draggingOverGroupId) {
          // console.log("has parent");
          return;
        }

        /**
         * if node already in a group, and current dragging over group is null, then remove the node from the group
        */
        if (sdnode.parent && !draggingOverGroupId) {
          st.onRemoveNodeFromGroup(node);
          return;
        }

        /**
         * if node is not in a group, and current dragging over group is not null, then add the node to the group
         */
        if (!sdnode.parent && draggingOverGroup) {
          // console.log("no parent");
          st.onAddNodeToGroup(node, draggingOverGroup);
          return;
        }
      })
    }
  }, []);


  React.useEffect(() => {
    if (ref.current) {
      const dom = document.body;
      dom.addEventListener("mousedown", onMouseDown, true);
      dom.addEventListener("mouseup", onMouseUp, true);
      return () => {
        dom.removeEventListener("mousedown", onMouseDown, true);
        dom.removeEventListener("mouseup", onMouseUp, true);
      }
    }
  }, [ref, onMouseDown, onMouseUp]);

  const onNodeDragStart = React.useCallback((ev: React.MouseEvent, node: Node) => {
  }, []);

  const onNodeDrag = React.useCallback((ev: React.MouseEvent, node: Node) => {
    // onSelectionChange({
    //   nodes: [node]
    // })
  }, []);

  const onNodeDragStop = React.useCallback((ev: React.MouseEvent, node: Node) => {
    onMouseUp();
  }, []);

  return {
    onNodeDragStart,
    onSelectionChange,
    onNodeDrag,
    onNodeDragStop
  }
}

/**
 * Keyboard Event handler 
 */
function useCopyPaste(ref, reactFlowInstance) {
  const onKeyPresshandler = React.useCallback((ev: KeyboardEvent) => {
    const metaKey = ev.metaKey;
    switch (ev.code) {
      case "KeyC":
        break;
      case "KeyV":
        break;
      case "KeyZ":
        if (metaKey && !ev.shiftKey) {
          undo();
        }
        if (metaKey && ev.shiftKey) {
          redo();
        }
        break;
      default:
        break;
    }

    function undo() {
      const undo = useAppStore.getState().undo;
      undo();
    }

    function redo() {
      const redo = useAppStore.getState().redo;
      redo();
    }
  }, []);

  const onCopy = React.useCallback((ev: ClipboardEvent) => {
    if ((ev.target as HTMLElement)?.className === "node-error" ||
      (ev.target as HTMLElement)?.tagName === 'INPUT' ||
      (ev.target as HTMLElement)?.tagName === 'TEXTAREA') {
      return;
    }

    const state = useAppStore.getState();
    const selectedNodes = state.nodes.filter(node => node.selected);
    const workflowMap = state.doc.getMap("workflow");
    const workflow = workflowMap.toJSON() as PersistedWorkflowDocument;
    copyNodes(selectedNodes.map((node) => {
      const id = node.id;
      return workflow.nodes[id];
    }), ev);

    if (ev.type === "cut") {
      // do something with cut
    }
  }, [])

  const onPaste = React.useCallback((ev: ClipboardEvent) => {
    if (
      (ev.target as HTMLElement)?.tagName === 'INPUT' ||
      (ev.target as HTMLElement)?.tagName === 'TEXTAREA' ) {
      return;
    }
    pasteNodes(ev);
  }, [reactFlowInstance])

  React.useEffect(() => {
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', onKeyPresshandler);
    return () => {
      document.removeEventListener('keydown', onKeyPresshandler);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('paste', onPaste);
    }
  }, [ref])
}