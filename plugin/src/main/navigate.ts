/** Selects a node and brings it into view, switching page when needed. */
export async function locate(nodeId: string): Promise<void> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') {
    figma.notify('That layer no longer exists. Run the check again.');
    return;
  }
  let page: BaseNode | null = node.parent;
  while (page && page.type !== 'PAGE') page = page.parent;
  if (page && page.type === 'PAGE' && page !== figma.currentPage) await figma.setCurrentPageAsync(page);
  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
}
