/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved. 
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *   
 *  The above copyright notice and this permission notice shall be included in 
 *  all copies or substantial portions of the Software.
 *   
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

/// <reference path="../_references.ts"/>

module powerbi.visuals {
    import SelectionManager = utility.SelectionManager;
 
 
    export interface RadarChartConstructorOptions {
        animator?: IGenericAnimator;
        svg?: D3.Selection;
        margin?: IMargin;
    }
    
    export interface RadarChartDatapoint {
        x: number;
        y: number;
        y0?: number;
        color?: string;
        value?: number;
        label?: string;
        identity: SelectionId;
        tooltipInfo?: TooltipDataItem[];
    }
    
    export interface RadarChartData {
        dataPoints: RadarChartDatapoint[][];
        legendData: LegendData;
    }

    export class RadarChart implements IVisual {
        public static capabilities: VisualCapabilities = {
            dataRoles: [
                {
                    name: 'Category',
                    kind: powerbi.VisualDataRoleKind.Grouping,
                },
                {
                    name: 'Y',
                    kind: powerbi.VisualDataRoleKind.Measure,
                },
            ],
            dataViewMappings: [{
                categories: {
                    for: { in: 'Category' },
                    dataReductionAlgorithm: { top: {} }
                },
                values: {
                    select: [{ bind: { to: 'Y' } }]
                },
            }],
            objects: {
                general: {
                    displayName: data.createDisplayNameGetter('Visual_General'),
                    properties: {
                        formatString: {
                            type: { formatting: { formatString: true } },
                        },
                    },
                },
                label: {
                    displayName: 'Label',
                    properties: {
                        fill: {
                            displayName: 'Fill',
                            type: { fill: { solid: { color: true } } }
                        }
                    }
                }
            }
        };

        private static VisualClassName = 'radarChart';

        private static Segments: ClassAndSelector = {
            class: 'segments',
            selector: '.segments'
        };

        private static SegmentNode: ClassAndSelector = {
            class: 'segmentNode',
            selector: '.segmentNode'
        };

        private static Axis: ClassAndSelector = {
            class: 'axis',
            selector: '.axis'
        };

        private static AxisNode: ClassAndSelector = {
            class: 'axisNode',
            selector: '.axisNode'
        };

        private static AxisLabel: ClassAndSelector = {
            class: 'axisLabel',
            selector: '.axisLabel'
        };

        private static Chart: ClassAndSelector = {
            class: 'chart',
            selector: '.chart'
        };

        private static ChartNode: ClassAndSelector = {
            class: 'chartNode',
            selector: '.chartNode'
        };

        private static ChartPolygon: ClassAndSelector = {
            class: 'chartPolygon',
            selector: '.chartPolygon'
        };

        private static ChartDots: ClassAndSelector = {
            class: 'chartDots',
            selector: '.chartDots'
        };

        private static ChartDot: ClassAndSelector = {
            class: 'chartDot',
            selector: '.chartDot'
        };

        private svg: D3.Selection;
        private segments: D3.Selection;
        private axis: D3.Selection;
        private chart: D3.Selection;
        private dots: D3.Selection;

        private mainGroupElement: D3.Selection;
        private colors: IDataColorPalette;
        private selectionManager: SelectionManager;
        private dataView: DataView;
        private viewport: IViewport;

        private animator: IGenericAnimator;
        private margin: IMargin;
        private legend: ILegend;

        private static DefaultMargin: IMargin = {
            top: 50,
            bottom: 50,
            right: 100,
            left: 100
        };

        private static SegmentLevels: number = 6;
        private static SegmentFactor: number = 1;
        private static Radians: number = 2 * Math.PI;
        private static Scale: number = 1;
        private angle: number;
        private radius: number;

        public static converter(dataView: DataView, colors: IDataColorPalette): RadarChartData {
            let catDv: DataViewCategorical = dataView.categorical;
            let values = catDv.values;

            let dataPoints: RadarChartDatapoint[][] = [];
            let legendData: LegendData = {
                dataPoints: [],
                title: catDv.categories[0].source.displayName
            };

            for (let i = 0, iLen = values.length; i < iLen; i++) {
                let color = colors.getColorByIndex(i).value;
                dataPoints.push([]);
                legendData.dataPoints.push({
                    label: values[i].source.displayName,
                    color: color,
                    icon: LegendIcon.Box,
                    selected: false,
                    identity: null
                });
                for (let k = 0, kLen = values[i].values.length; k < kLen; k++) {
                    let id = SelectionIdBuilder
                        .builder()
                        .withSeries(dataView.categorical.values, dataView.categorical.values[i])
                        .createSelectionId();
                    dataPoints[i].push({
                        x: k,
                        y: values[i].values[k],
                        color: color,
                        identity: id
                    });
                }
            }

            return {
                dataPoints: dataPoints,
                legendData: legendData
            };
        }

        public constructor(options?: RadarChartConstructorOptions) {

            if (options) {
                if (options.svg) {
                    this.svg = options.svg;
                }
                if (options.animator) {
                    this.animator = options.animator;
                }
                this.margin = options.margin || RadarChart.DefaultMargin;
            }
        }

        public init(options: VisualInitOptions): void {
            let element = options.element;
            this.selectionManager = new SelectionManager({ hostServices: options.host });

            if (!this.svg) {
                this.svg = d3.select(element.get(0)).append('svg');
            }

            this.svg.classed(RadarChart.VisualClassName, true);

            this.colors = options.style.colorPalette.dataColors;
            this.mainGroupElement = this.svg.append('g');

            this.legend = createLegend(element, false, null);

            this.segments = this.mainGroupElement
                .append('g')
                .classed(RadarChart.Segments.class, true);

            this.axis = this.mainGroupElement
                .append('g')
                .classed(RadarChart.Axis.class, true);

            this.chart = this.mainGroupElement
                .append('g')
                .classed(RadarChart.Chart.class, true);

            this.dots = this.mainGroupElement
                .append('g')
                .classed(RadarChart.ChartDots.class, true);

        }

        public update(options: VisualUpdateOptions): void {
            if (!options.dataViews || !options.dataViews[0]) return;
            let dataView = this.dataView = options.dataViews[0];
            let data = RadarChart.converter(dataView, this.colors);
            let dataPoints = data.dataPoints;
            let viewport = this.viewport = options.viewport;
            let duration = AnimatorCommon.GetAnimationDuration(this.animator, options.suppressAnimations);

            this.legend.drawLegend(data.legendData, viewport);
            this.svg
                .attr({
                    'height': viewport.height,
                    'width': viewport.width
                });

            let mainGroup = this.mainGroupElement;
            mainGroup.attr('transform', SVGUtil.translate(viewport.width / 2, viewport.height / 2));

            let width: number = viewport.width - this.margin.left - this.margin.right;
            let height: number = viewport.height - this.margin.top - this.margin.bottom;

            this.angle = RadarChart.Radians / dataPoints[0].length;
            this.radius = RadarChart.SegmentFactor * RadarChart.Scale * Math.min(width, height) / 2;

            let categories = dataView.categorical.categories[0].values;

            this.drawCircularSegments(categories);
            this.drawAxes(categories);
            this.drawAxesLabels(categories);
            this.drawChart(dataPoints, duration);
        }

        private drawCircularSegments(values: string[]): void {

            const angle: number = this.angle,
                factor: number = RadarChart.SegmentFactor,
                levels: number = RadarChart.SegmentLevels,
                radius: number = this.radius;

            let selection: D3.Selection = this.mainGroupElement
                .select(RadarChart.Segments.selector)
                .selectAll(RadarChart.SegmentNode.selector);

            let data = [];

            for (let level = 0; level < levels - 1; level++) {
                const levelFactor: number = radius * ((level + 1) / levels);
                const transform: number = -1 * levelFactor;

                for (let i = 0; i < values.length; i++) {
                    data.push({
                        x1: levelFactor * (1 - factor * Math.sin(i * angle)),
                        y1: levelFactor * (1 - factor * Math.cos(i * angle)),
                        x2: levelFactor * (1 - factor * Math.sin((i + 1) * angle)),
                        y2: levelFactor * (1 - factor * Math.cos((i + 1) * angle)),
                        translate: `translate(${transform},${transform})`
                    });

                }
            }

            let segments = selection.data(data);
            segments
                .enter()
                .append('svg:line');
            segments
                .attr('x1', item => item.x1)
                .attr('y1', item => item.y1)
                .attr('x2', item => item.x2)
                .attr('y2', item => item.y2)
                .attr('transform', item => item.translate)
                .classed(RadarChart.SegmentNode.class, true);
        }

        private drawAxes(values: string[]): void {

            const angle: number = this.angle,
                radius: number = this.radius;

            let selection: D3.Selection = this.mainGroupElement
                .select(RadarChart.Axis.selector)
                .selectAll(RadarChart.AxisNode.selector);

            let axis = selection.data(values);

            axis
                .enter()
                .append('svg:line');
            axis
                .attr('label', item => item)
                .attr('x1', 0)
                .attr('y1', 0)
                .attr('x2', (name, i) => radius * Math.sin(i * angle))
                .attr('y2', (name, i) => radius * Math.cos(i * angle))
                .classed(RadarChart.AxisNode.class, true);

            axis.exit().remove();
        }

        private drawAxesLabels(values: string[]): void {

            const angle: number = this.angle,
                radius: number = this.radius;

            let selection: D3.Selection = this.mainGroupElement
                .select(RadarChart.Axis.selector)
                .selectAll(RadarChart.AxisLabel.selector);

            let labels = selection.data(values);

            labels
                .enter()
                .append('svg:text');

            labels
                .attr('text-anchor', 'middle')
                .attr('dy', '1.5em')
                .attr('transform', 'translate(0, -10)')
                .attr('x', (name, i) => {
                    return radius * Math.sin(i * angle) + 20 * Math.sin(i * angle);
                })
                .attr('y', (name, i) => {
                    return radius * Math.cos(i * angle) + 10 * Math.cos(i * angle);
                })
                .text(item => item)
                .classed(RadarChart.AxisLabel.class, true);

            labels.exit().remove();
        }

        private drawChart(dataPoints: RadarChartDatapoint[][], duration: number): void {
            const angle: number = this.angle,
                  radius: number = this.radius,
                  opacity: number = .5,
                  dotRadius: number = 5;

            let stack = d3.layout.stack();
            let layers = stack(dataPoints);

            let y = d3.scale.linear()
                .domain([0, d3.max(layers, (layer) => {
                    return d3.max(layer, (d) => {
                        return d.y0 + d.y;
                    });
                })]).range([0, radius]);

            let calculatePoints = (points) => {
                return points.map((value, i) => {
                    const x1 = y(value.y) * Math.sin(i * angle);
                    const y1 = y(value.y) * Math.cos(i * angle);
                    return `${x1},${y1}`;
                }).join(' ');
            };

            let sm = this.selectionManager;
            let selection = this.chart.selectAll(RadarChart.ChartNode.selector).data(layers);

            selection
                .enter()
                .append('g')
                .classed(RadarChart.ChartNode.class, true);

            let polygon = selection.selectAll(RadarChart.ChartPolygon.selector).data(d => [d]);
            polygon    
                .enter()
                .append('polygon')
                .classed(RadarChart.ChartPolygon.class, true);
            polygon
                .style('fill', d => d[0].color)
                .style('opacity', opacity)
                .on('mouseover', function(d) {
                    sm.select(d[0].identity).then(ids => {
                        d3.select(this).transition()
                                        .duration(duration)
                                        .style('opacity', 1);
                    });
                })
                .on('mouseout', function(d) {
                    sm.select(d[0].identity).then(ids => {
                        d3.select(this).transition()
                                        .duration(duration)
                                        .style('opacity', opacity);
                    });
                })
                .attr('points', calculatePoints);
            polygon.exit().remove();

            let dots = selection.selectAll(RadarChart.ChartDot.selector).data(d => d);
            dots.enter()
                .append('svg:circle')
                .classed(RadarChart.ChartDot.class, true);
            dots.attr('r', dotRadius)
                .attr('cx', (value, i) => y(value.y) * Math.sin(i * angle))
                .attr('cy', (value, i) => y(value.y) * Math.cos(i * angle))
                .style('fill', d => d.color);
            dots.exit().remove();

            selection.exit().remove();
        }
    }
}
