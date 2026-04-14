import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
    process.env.DB_NAME, 
    process.env.DB_USER, 
    process.env.DB_PASSWORD, 
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        dialectOptions: {
            connectTimeout: 10000,       // 10s to establish the connection
            enableKeepAlive: true,       // turn on TCP keep-alive
            keepAliveInitialDelay: 10000 // wait 10s before sending the first probe
          },
          pool: {
            max: 10,                // up to 10 concurrent connections
            min: 0,                 // no minimum
            acquire: 30000,         // wait up to 30s for a free connection
            idle: 10000             // release idle connections after 10s
          },
          logging: false           // turn off SQL logging in production
    }
);

export default sequelize;

