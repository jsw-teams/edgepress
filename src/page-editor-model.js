// The editor changes the original objects, including unrecognized properties.
// Locations are derived after each edit so moves cannot leave stale indices.
export function containers(page) {
  const found = [];
  function visit(list, label, ancestors, row, cell, depth) {
    found.push({ list, label, ancestors, row, cell, depth });
    for (const block of list) {
      if (Array.isArray(block.blocks)) visit(block.blocks, label + ' › ' + (block.title || '分区'), [...ancestors, block], row, cell, depth + 1);
    }
  }
  page.blocks.forEach((row, r) => row.cells.forEach((list, c) => visit(list, '第 ' + (r + 1) + ' 行 › 栏 ' + (c + 1), [], r, c, 0)));
  return found;
}

export function locate(page, block) {
  for (const container of containers(page)) {
    const index = container.list.indexOf(block);
    if (index !== -1) return { ...container, index };
  }
  return null;
}

export function moveElement(page, block, target, position = target.length) {
  const source = locate(page, block);
  const destination = containers(page).find(item => item.list === target);
  if (!source || !destination) throw new Error('元素位置已改变，请重新选择。');
  if (destination.ancestors.includes(block)) throw new Error('不能把分区放入它自己或自己的子分区。');
  if (!Number.isInteger(position) || position < 0 || position > target.length) throw new Error('无效的元素位置。');
  if (source.list !== target && target.length >= 100) throw new Error('每个容器最多放置 100 个元素。');
  const subtreeDepth = value => Array.isArray(value.blocks) ? 1 + Math.max(0, ...value.blocks.map(subtreeDepth)) : 0;
  if (destination.depth + subtreeDepth(block) > 12) throw new Error('分区嵌套不能超过 12 层。');
  source.list.splice(source.index, 1);
  if (source.list === target && source.index < position) position--;
  target.splice(position, 0, block);
}

export function resizeRow(row, columns) {
  if (!Number.isInteger(columns) || columns < 1 || columns > 4) throw new Error('每行支持 1–4 栏。');
  if (columns < row.columns && row.cells.slice(columns - 1).reduce((count, list) => count + list.length, 0) > 100) throw new Error('合并后每栏不能超过 100 个元素，请先移动部分元素。');
  if (columns < row.columns) for (const extra of row.cells.slice(columns)) row.cells[columns - 1].push(...extra);
  while (row.cells.length < columns) row.cells.push([{ type: 'text', text: '' }]);
  row.cells.length = columns;
  row.columns = columns;
}

export function emptyContainers(page) {
  return containers(page).filter(item => !item.list.length);
}
