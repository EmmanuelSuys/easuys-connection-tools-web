export function meshRectangle(mesh, origin, edgeU, edgeV, divisionsU, divisionsV, thickness, material, tolerance = 1e-6, region) {
    if (!Number.isInteger(divisionsU) || !Number.isInteger(divisionsV) || divisionsU < 1 || divisionsV < 1)
        throw new Error("Mesh divisions must be positive integers");
    const byKey = new Map();
    for (const node of mesh.nodes)
        byKey.set(node.xyz.map(x => Math.round(x / tolerance)).join(","), node);
    const grid = [];
    for (let j = 0; j <= divisionsV; j++) {
        const row = [];
        for (let i = 0; i <= divisionsU; i++) {
            const u = i / divisionsU, v = j / divisionsV;
            const p = [origin[0] + u * edgeU[0] + v * edgeV[0], origin[1] + u * edgeU[1] + v * edgeV[1], origin[2] + u * edgeU[2] + v * edgeV[2]];
            const key = p.map(x => Math.round(x / tolerance)).join(",");
            let node = byKey.get(key);
            if (!node) {
                node = { id: mesh.nodes.length, xyz: p };
                mesh.nodes.push(node);
                byKey.set(key, node);
            }
            row.push(node);
        }
        grid.push(row);
    }
    const created = [];
    for (let j = 0; j < divisionsV; j++)
        for (let i = 0; i < divisionsU; i++) {
            const element = { nodes: [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]], thickness, material, region };
            mesh.elements.push(element);
            created.push(element);
        }
    return created;
}
