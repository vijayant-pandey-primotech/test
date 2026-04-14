  // middleware/authorize.js
import { jwtAuth } from "./jwtMiddleware.js";
import { roles } from "../config/roles.js"; 
import sequelize from "../config/db.js";

// export const adminAuth = async (req, res, next) => {
//   try {
//     // First verify JWT token
//     await jwtAuth(req, res, async () => {
//       // After JWT verification, check if user is admin
//       const user = await UserMaster.findOne({
//         where: { userId: req.user.id }
//       });

//       if (!user) {
//         return res.status(404).json({
//           success: false,
//           message: ERROR_MESSAGES.USER_NOT_FOUND
//         });
//       }

//       if (user.userType !== "admin") {
//         return res.status(403).json({
//           success: false,
//           message: "Access denied. Admin privileges required."
//         });
//       }

//       // If both checks pass, proceed to next middleware/route handler
//       next();
//     });
//   } catch (error) {
//     console.error("Admin Auth Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: ERROR_MESSAGES.INTERNAL_SERVER
//     });
//   }
// };


export const authorize = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      await jwtAuth(req, res, async () => {
        // console.log(req.user,"=============================req.user adminAuthMiddleware");
        // console.log("req.user:", req.user);
        // console.log("userId being used:", req.user.id);
        let [results, metadata] = await sequelize.query(
          `SELECT * FROM adminMaster 
           LEFT JOIN adminRoles ON adminMaster.roleId = adminRoles.id 
           WHERE adminMaster.adminId = :adminId`, 
          {
            replacements: { adminId: req.user.id },
            type: sequelize.QueryTypes.SELECT
          }
        );
        
        let user = results; // If expecting one user
        // console.log(user,"=============================user adminAuthMiddleware");
        if (!user) {
          return res.status(404).json({ success: false, message: "User not found" });
        }
        // console.log(user,"=============================user adminAuthMiddleware");
        const userPermissions = roles[user.roleName.toLowerCase()] || [];

        // Match exact or wildcard permission
        if (
          userPermissions.includes(requiredPermission) ||
          userPermissions.includes(`${requiredPermission.split(':')[0]}:*`) ||
          userPermissions.includes("*")
        ) {
          req.user.role = user.roleName;
          return next();
        }

        return res.status(403).json({
          success: false,
          message: `Access denied. You don't have permission for this action.`
        });
      });
    } catch (error) {
      console.error("Authorization error:", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  };
};
