/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prefer-const */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */
'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { Brain, Database, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Node {
  id: string
  label: string
  type: 'memory' | 'entity'
  group: string
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}

interface Link {
  source: string
  target: string
}

export function GraphVisualizer({ memories, entities, memoryEntities }: { memories: any[], entities: any[], memoryEntities: any[] }) {
  const [nodes, setNodes] = useState<Node[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [scale, setScale] = useState(1)
  const svgRef = useRef<SVGSVGElement>(null)
  const animationRef = useRef<number>(0)
  const [draggedNode, setDraggedNode] = useState<string | null>(null)

  useEffect(() => {
    // Deduplicate entities
    const entityMap = new Map()
    entities.forEach(e => {
      const key = e.name.toLowerCase().trim()
      if (!entityMap.has(key)) {
        entityMap.set(key, e)
      }
    })
    
    const uniqueEntities = Array.from(entityMap.values())

    const newNodes: Node[] = []
    const newLinks: Link[] = []

    memories.forEach((m, i) => {
      newNodes.push({
        id: `m_${m.id}`,
        label: m.title,
        type: 'memory',
        group: m.category || 'default',
        x: Math.random() * 800,
        y: Math.random() * 600,
        vx: 0, vy: 0,
        radius: 20
      })
    })

    uniqueEntities.forEach((e, i) => {
      newNodes.push({
        id: `e_${e.name.toLowerCase().trim()}`,
        label: e.name,
        type: 'entity',
        group: e.type,
        x: Math.random() * 800,
        y: Math.random() * 600,
        vx: 0, vy: 0,
        radius: 12
      })
    })

    memoryEntities.forEach(me => {
      const entity = entities.find(e => e.id === me.entity_id)
      if (entity) {
        newLinks.push({
          source: `m_${me.memory_id}`,
          target: `e_${entity.name.toLowerCase().trim()}`
        })
      }
    })

    setNodes(newNodes)
    setLinks(newLinks)
  }, [memories, entities, memoryEntities])

  // Simple Force-Directed Simulation
  useEffect(() => {
    if (nodes.length === 0) return

    let currentNodes = [...nodes]
    
    const tick = () => {
      const alpha = 0.1 // cooling factor
      
      // Forces
      for (let i = 0; i < currentNodes.length; i++) {
        const node1 = currentNodes[i]
        if (node1.id === draggedNode) continue

        // Repulsion
        for (let j = 0; j < currentNodes.length; j++) {
          if (i === j) continue
          const node2 = currentNodes[j]
          const dx = node1.x - node2.x
          const dy = node1.y - node2.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          if (dist < 150) {
            const force = (150 - dist) / dist * alpha * 0.5
            node1.vx += dx * force
            node1.vy += dy * force
          }
        }
        
        // Center Gravity
        const dx = 400 - node1.x
        const dy = 300 - node1.y
        node1.vx += dx * alpha * 0.05
        node1.vy += dy * alpha * 0.05
      }

      // Attraction (Links)
      links.forEach(link => {
        const source = currentNodes.find(n => n.id === link.source)
        const target = currentNodes.find(n => n.id === link.target)
        if (source && target) {
          const dx = target.x - source.x
          const dy = target.y - source.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = (dist - 100) / dist * alpha * 0.1
          
          if (source.id !== draggedNode) {
            source.vx += dx * force
            source.vy += dy * force
          }
          if (target.id !== draggedNode) {
            target.vx -= dx * force
            target.vy -= dy * force
          }
        }
      })

      // Update positions
      currentNodes.forEach(node => {
        if (node.id !== draggedNode) {
          node.vx *= 0.9 // Friction
          node.vy *= 0.9
          node.x += node.vx
          node.y += node.vy
        }
      })

      setNodes([...currentNodes])
      animationRef.current = requestAnimationFrame(tick)
    }

    animationRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationRef.current)
  }, [nodes.length, links.length, draggedNode]) // Only re-run when nodes count changes or drag starts

  const handlePointerDown = (id: string, e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDraggedNode(id)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggedNode && svgRef.current) {
      const pt = svgRef.current.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const svgP = pt.matrixTransform(svgRef.current.getScreenCTM()?.inverse())
      
      setNodes(prev => prev.map(n => n.id === draggedNode ? { ...n, x: svgP.x, y: svgP.y } : n))
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    setDraggedNode(null)
  }

  return (
    <div className="relative w-full h-full bg-muted/5 border border-border rounded-xl overflow-hidden flex flex-col">
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button variant="outline" size="icon" onClick={() => setScale(s => s * 1.2)}><ZoomIn className="w-4 h-4" /></Button>
        <Button variant="outline" size="icon" onClick={() => setScale(s => s / 1.2)}><ZoomOut className="w-4 h-4" /></Button>
      </div>

      <svg 
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        viewBox="0 0 800 600"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <g transform={`scale(${scale}) translate(${(1 - scale) * 400}, ${(1 - scale) * 300})`}>
          {/* Links */}
          {links.map((link, i) => {
            const source = nodes.find(n => n.id === link.source)
            const target = nodes.find(n => n.id === link.target)
            if (!source || !target) return null
            return (
              <line 
                key={i} 
                x1={source.x} y1={source.y} 
                x2={target.x} y2={target.y} 
                stroke="currentColor" 
                strokeWidth={1}
                className="text-primary/20"
              />
            )
          })}
          
          {/* Nodes */}
          {nodes.map(node => (
            <g 
              key={node.id} 
              transform={`translate(${node.x}, ${node.y})`}
              onPointerDown={(e) => handlePointerDown(node.id, e)}
              className="cursor-pointer"
            >
              <circle 
                r={node.radius} 
                fill={node.type === 'memory' ? 'var(--primary)' : 'var(--muted)'}
                className={node.type === 'memory' ? 'text-primary' : 'text-muted border border-border'}
                strokeWidth={2}
                stroke={node.type === 'memory' ? 'hsl(var(--background))' : 'hsl(var(--foreground))'}
              />
              {node.type === 'memory' && (
                <Database className="w-4 h-4 text-primary-foreground absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none" x={0} y={0} />
              )}
              {node.type === 'entity' && (
                <Brain className="w-3 h-3 text-foreground/50 absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none" x={0} y={0} />
              )}
              <text 
                y={node.radius + 12} 
                textAnchor="middle" 
                className="text-[10px] font-medium fill-foreground/80 select-none pointer-events-none"
              >
                {node.label.length > 20 ? node.label.slice(0, 20) + '...' : node.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
