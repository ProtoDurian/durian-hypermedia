// d3-sankey ships no types: the little the layout uses (layout only; the view draws the SVG).
declare module "d3-sankey" {
  export function sankey(): any;
  export function sankeyJustify(node: any, n: number): number;
}
