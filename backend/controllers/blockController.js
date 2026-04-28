const Block = require('../models/Block');

exports.getBlocks = async (req, res) => {
    try {
        const level = parseInt(req.query.level) || 1;
        const blocks = await Block.findAll({
            where: { level },
            attributes: ['name', 'x', 'y', 'z', 'level', 'role']
        });
        res.json(blocks);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener bloques', error });
    }
};

exports.addBlock = async (req, res) => {
    try {
        const { name, x, y, z, level, role } = req.body;
        const newBlock = await Block.create({ name, x, y, z, level, role });
        res.status(201).json({ message: 'Bloque guardado', block: newBlock });
    } catch (error) {
        res.status(500).json({ message: 'Error al agregar bloque', error });
    }
};

exports.addMultipleBlocks = async (req, res) => {
    try {
        const blocks = req.body; // array [{ x, y, z }, ...]
        await Block.bulkCreate(blocks);
        res.status(201).json({ message: 'Bloques guardados', count: blocks.length });
    } catch (error) {
        res.status(500).json({ message: 'Error al agregar bloques', error });
    }
};
