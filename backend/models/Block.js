const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Block = sequelize.define('Block', {
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    x: {
        type: DataTypes.FLOAT,
        defaultValue: 0
    },
    y: {
        type: DataTypes.FLOAT,
        defaultValue: 0
    },
    z: {
        type: DataTypes.FLOAT,
        defaultValue: 0
    },
    level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    role: {
        type: DataTypes.ENUM('finalPrize', 'default'),
        defaultValue: 'default'
    }
});

module.exports = Block;
