import { CSSProperties, MutableRefObject, memo, use, useCallback, useState } from "react";
import { NodeWrapperProps } from "../reactflow-node/reactflow-node-wrapper";
import { useAppStore } from "@comflowy/common/store";
import { NODE_GROUP, NodeVisibleState, SDNODE_DEFAULT_COLOR } from "@comflowy/common/types";
import nodeStyles from "../reactflow-node/reactflow-node.style.module.scss";
import Color from "color";
import { ComflowyNodeResizer, useNodeAutoResize } from "../reactflow-node/reactflow-node-resize";
import { getNodeRenderInfo } from "@comflowy/common/workflow-editor/node-rendering";
import {Slot} from "../reactflow-node/reactflow-node-slot";
import { Position } from "reactflow";
import { getTransformStyle } from "../reactflow-node/reactflow-node";
import { INVISIBLE_TRANSFORM_THRSHOLD } from "../reactflow-node/reactflow-node";
/**
 * group node
 */
export const GroupNode = memo((props: NodeWrapperProps) => {
  const node = props;
  const id = props.id;
  const nodeVisibleState = node.data.visibleState;
  const isDraggingNodeOverCurrentGroup = useAppStore(st => st.draggingOverGroupId === id);
  let nodeColor = props.data.value.color || SDNODE_DEFAULT_COLOR.color;
  const transform = useAppStore(st => st.transform);
  const invisible = transform < INVISIBLE_TRANSFORM_THRSHOLD;

  let $view;
  if (invisible) {
    $view = <GroupSmallTransformState node={props} />
  } else {
    switch (nodeVisibleState) {
      case NodeVisibleState.Collapsed:
        $view = <GroupCollapsed node={props} />
        break;
      default:
        $view = <GroupExpanded node={props} />;
        break;
    }
  }


  const collapsed = nodeVisibleState === NodeVisibleState.Collapsed;
  return (
    <div className={`
      ${nodeStyles.reactFlowGroup}
      ${nodeStyles.reactFlowNode} 
      ${(node.selected || isDraggingNodeOverCurrentGroup) ? nodeStyles.reactFlowSelected : ""} 
      ${collapsed ? nodeStyles.nodeCollapsed : ""}
      `} style={{
        '--node-color': nodeColor,
        '--node-border-color': nodeColor,
        '--node-bg-color': Color(SDNODE_DEFAULT_COLOR.bgcolor).alpha(.25).hexa(),
      } as CSSProperties}> 
      {$view}
    </div>
  )
});

function GroupSmallTransformState(props: {
  node: NodeWrapperProps,
}) {
  const node = props.node
  const childrenIds = node.data.children || [];
  const { mainRef, minHeight, minWidth, setResizing } = useNodeAutoResize(node, []);
  const transform = useAppStore(st => st.transform);
  const { title } = getNodeRenderInfo(node.data.value, node.data.widget);
  return (
    <>
      <ComflowyNodeResizer setResizing={setResizing} minWidth={minWidth} minHeight={minHeight} node={node} />
      <div className="node-header">
        <h2 className="group-node-title node-title" style={getTransformStyle(transform)}>
          {title}({childrenIds.length} children)
        </h2>
      </div>
      <div className="node-main"></div>
    </>
  )
}

/**
 * 
 * @param params 
 */
function GroupCollapsed(props: {
  node: NodeWrapperProps,
}) {
  const { node } = props;
  const sdnode = node.data.value;
  const { title } = getNodeRenderInfo(sdnode, node.data.widget);
  const childrenIds = node.data.children || [];
  const children = useAppStore(st => childrenIds.map(id => st.graph[id].flowNode));
  let totalInputs = 0, totalOutputs = 0;
  const childrenWidthRenderInfo = children.map(child => {
    const ret = {
      node: child,
      renderInfo: getNodeRenderInfo(child.data.value, child.data.widget)
    }
    totalInputs += ret.renderInfo.inputs.length;
    totalOutputs += ret.renderInfo.outputs.length;
    return ret;
  })
  const transform = useAppStore(st => st.transform);
  // render slots of children
  return (
    <div className="node-inner">
      <div className="node-header">
        <h2 className="group-node-title node-title" style={getTransformStyle(transform)}>
          {title}({children.length} children)
        </h2>
      </div>
      <div className="fake-slots">
        {totalInputs > 0 && (
          <div className="fake-slot fake-slot-left"></div>
        )}
        {totalOutputs > 0 && (
          <div className="fake-slot fake-slot-right"></div>
        )}
      </div>

      <div className="node-main">
        <div className="node-main-inner">
          <div className="node-slots">
            <div className="node-inputs">
              {childrenWidthRenderInfo.map(childWidthRenderInfo => {
                const { inputs, outputs, title } = childWidthRenderInfo.renderInfo;
                return inputs.map((input, index) => (
                  <Slot node_id={node.id} key={input.name + index} widget={NODE_GROUP} valueType={input.type} id={input.name} label={input.name} type="target" position={Position.Left} />
                ))
              })}
            </div>
            <div className="node-outputs">
              {childrenWidthRenderInfo.map(childWidthRenderInfo => { 
                const { inputs, outputs, title } = childWidthRenderInfo.renderInfo;
                return outputs.map((output, index) => (
                  <Slot node_id={node.id} key={output.name + index} widget={NODE_GROUP} valueType={output.type} id={output.name} label={output.name} type="source" position={Position.Right} />
                ))
              })}
            </div>
          </div>
        </div>
      </div>
  </div>
  )
}

function GroupExpanded(props: {
  node: NodeWrapperProps,
}) {
  const {node} = props;
  const sdnode = node.data.value;
  const { title } = getNodeRenderInfo(sdnode, node.data.widget);
  const { mainRef, minHeight, minWidth, setResizing } = useNodeAutoResize(node, []);
  const transform = useAppStore(st => st.transform);
  return (
    <>
      <ComflowyNodeResizer setResizing={setResizing} minWidth={minWidth} minHeight={minHeight} node={node} /> 
      <div className="node-inner">
        <div className="node-header">
          <h2 className="node-title" style={getTransformStyle(transform)}>
            {title}
          </h2>
        </div>
        <div className="node-main">
        </div>
      </div>
    </>
  )
}

function GroupCollapsedAsNode(props: NodeWrapperProps) {
  return (
    <>
    </>
  )
}