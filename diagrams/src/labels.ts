/** The words of the component, English by default; a consumer passes its own. */
export interface DiagramLabels {
  problems: string
  line: string
  pending: string
  loading: string
  failed: string
  links: string
  zoomIn: string
  zoomOut: string
  fit: string
  open: string
}

export const DEFAULT_DIAGRAM_LABELS: DiagramLabels = {
  problems: 'This diagram has problems:',
  line: 'line',
  pending: 'This kind of diagram is not drawn yet; it reads:',
  loading: 'Drawing…',
  failed: 'The diagram could not be drawn:',
  links: 'Links:',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit',
  open: 'Open',
}
