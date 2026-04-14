import bcrypt from "bcrypt";
import {
  City,
  Country,
  State,
  StoriesSubCategory,
  UserMaster,
  Stories,
  UserStories,
  UserStoriesData,
  ChapterMaster,
  ItemMaster,
  userSession
} from "../model/index.js";
import {
  decryptPassword,
  generate6DigitOTP,
  generateToken,
  sendOTPAsync,
  generateAccessToken,
  processStoryDetails,
  createPersonalStoriesData,
  updateFirebaseProfile,
  updateFirebaseProfileImage,
  encryptData,
} from "../helpers/authHelper.js";
import jwt from "jsonwebtoken";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "../helpers/messages.js";
import sequelize from "../config/db.js";
import moment from "moment-timezone";
import { deleteImageFromGCS, uploadFileToGCS } from "../helpers/fileUpload.js";
import { userStoriesDescription } from "../config/firebaseDb.js";
import { Sequelize } from "sequelize";
import { findDynamicField } from "../helpers/dynamicItems.js";

const signupUser = async ({
  firstName,
  lastName,
  phone,
  email,
  password,
  is_two_fa_enabled = 0,
}) => {
  if (!email || !password || !firstName || !lastName) {
    return { error: "Missing required fields", status: 400 };
  }

  let user = await UserMaster.findOne({ where: { emailAddress: email } });
  const decryptedPassword = await decryptPassword(password);
  const salt = await bcrypt.genSalt(10);
  const hashPassword = await bcrypt.hash(decryptedPassword, salt);
  const otp = await generate6DigitOTP();
  const emailType = 1;

  if (user) {
    if (!user.firstName || !user.lastName || !user.password) {
      await user.update({
        firstName,
        lastName,
        phone,
        password: hashPassword,
        is_two_fa_enabled,
        isMigrated: 0,
      });
      sendOTPAsync(email, otp, emailType);

      const payload = {
        id: user.userId,
        email: user.emailAddress,
        userImage: user.userImage,
        otp,
      };
      const token = await generateToken(payload);
      await user.update({ token });

      return {
        body: { ...user.toJSON(), token, confirmPassword: hashPassword },
      };
    }
    return { error: "Email already exists", status: 400 };
  }

  user = await UserMaster.create({
    firstName,
    lastName,
    phone,
    emailAddress: email,
    password: hashPassword,
    userType: "user",
    is_two_fa_enabled,
    isMigrated: 0,
  });

  sendOTPAsync(email, otp, emailType);
  const token = generateToken({ id: user.userId, otp });
  user.token = otp;
  await user.save();

  return { body: { ...user.toJSON(), token, confirmPassword: hashPassword } };
};

const resetPassword = async ({ email }) => {
  if (!email) return { error: ERROR_MESSAGES.INVALID_EMAIL, status: 400 };

  const user = await UserMaster.findOne({ where: { emailAddress: email } });
  if (!user) return { error: ERROR_MESSAGES.USER_NOT_FOUND, status: 404 };

  const otp = await generate6DigitOTP();
  user.token = otp;
  await user.save();

  const emailType = 4;
  const emailSent = await sendOTPAsync(email, otp, emailType, user.firstName);
  const token = generateToken({ email });

  return emailSent
    ? { body: { token } }
    : { error: ERROR_MESSAGES.FAILED_TO_SEND_EMAIL, status: 400 };
};

const createPassword = async ({ email }, { newPassword }) => {
  if (!newPassword)
    return { error: ERROR_MESSAGES.NEW_PASS_REQUIRED, status: 400 };

  const user = await UserMaster.findOne({ where: { emailAddress: email } });
  if (!user) return { error: ERROR_MESSAGES.USER_NOT_FOUND, status: 404 };

  const decryptedPassword = await decryptPassword(newPassword);
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(decryptedPassword, salt);

  await UserMaster.update(
    { password: hash },
    { where: { emailAddress: email } }
  );

  return {};
};

// resend otp
const resendOTP = async (email, userId, type) => {
  try {
    // Optimize query: Fetch user in one go instead of checking separately
    const whereCondition = email ? { emailAddress: email } : { userId };
    const user = await UserMaster.findOne({ where: whereCondition });

    if (!user || user.isOtpVerified) {
      return {
        status: 404,
        data: { message: ERROR_MESSAGES.USER_NOT_FOUND },
      };
    }

    // Generate OTP and token
    const randomOtp = await generate6DigitOTP();
    const token = generateToken({ id: user.userId, otp: randomOtp });

    // Update user record asynchronously
    user.token = randomOtp;
    await user.save(); // Ensure atomic update

    // Send OTP asynchronously (Non-blocking)
    sendOTPAsync(user.emailAddress, randomOtp, type, user.firstName).catch(
      (err) => console.error("OTP send error:", err)
    );

    return {
      status: 200,
      data: {
        message: SUCCESS_MESSAGES.OTP_RESENT,
        body: {
          email: user.emailAddress,
          token,
        },
      },
    };
  } catch (error) {
    console.error("Error in resendOTPService:", error);
    return {
      status: 500,
      data: { message: ERROR_MESSAGES.INTERNAL_SERVER },
    };
  }
};

const verifyUserOTP = async ({ email, otp, scenario }, user) => {
  if (!otp) {
    return { error: ERROR_MESSAGES.MISSING_OTP, status: 400 };
  }

  let userData = email
    ? await UserMaster.findOne({
        where: { emailAddress: email },
        attributes: ["token", "emailAddress"],
        raw: true,
      })
    : await UserMaster.findOne({
        where: { userId: user.id },
        attributes: ["token", "emailAddress"],
        raw: true,
      });

  if (!userData) {
    return { error: ERROR_MESSAGES.USER_NOT_FOUND, status: 404 };
  }

  const storedOtp = userData.token;

  if (!storedOtp) {
    return { error: ERROR_MESSAGES.MISSING_OTP, status: 400 };
  }

  let otpDecoded;
  try {
    otpDecoded = jwt.verify(storedOtp, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return { error: ERROR_MESSAGES.OTP_EXPIRED, status: 400 };
    }
    throw error;
  }
  // let message = se
  if (Number(otp) !== otpDecoded.otp) {
    return { error: ERROR_MESSAGES.INVALID_OTP, status: 400 };
  }

  return await handleOTPScenario(scenario, user, email);
};

const handleOTPScenario = async (scenario, user, email) => {
  if (scenario === "loginSignup") {
    return await handleLoginSignup(user);
  } else if (scenario === "passwordReset") {
    const token = generateToken({ email }, "5m");
    return { body: { token } };
  } else {
    return { error: "Invalid request", status: 400 };
  }
};
const handleLoginSignup = async (user) => {
  let userInfo = await UserMaster.findOne({ where: { userId: user.id } });

  if (!userInfo) {
    return { error: ERROR_MESSAGES.USER_NOT_FOUND, status: 404 };
  }

  if (!userInfo.isOtpVerified) {
    userInfo.isOtpVerified = 1;
    await userInfo.save();
  }

  if (!userInfo.is_active) {
    const payload = { id: userInfo.userId };
    const refreshToken = generateToken(payload);
    const token = generateAccessToken(payload);

    return {
      body: { ...userInfo.toJSON(), token: refreshToken, refreshToken: token },
    };
  } else {
    const payload = {
      id: userInfo.userId,
      email: userInfo.emailAddress,
      userName: userInfo.firstName,
      userImage: userInfo.userImage,
    };
    const token = generateToken(payload);

    await userInfo.update({ token, isAuthenticated: 1 });

    return { body: userInfo };
  }
};

const loginUser = async ( email, password, loginTime ) => {
  console.log(email,password,'====================loginUser');
  let user = await UserMaster.findOne({
    where: { emailAddress: email },
    raw: true,
  });

  if (!user) {
    return { error: ERROR_MESSAGES.INVALID_CREDENTIALS, status: 401 };
  }

  const decryptedPassword = await decryptPassword(password);

  if (!user.password) {
    return { error: ERROR_MESSAGES.INVALID_CREDENTIALS, status: 400 };
  }
  const isMatch = await bcrypt.compare(decryptedPassword, user.password);

  if (!isMatch) {
    return { error: ERROR_MESSAGES.INVALID_CREDENTIALS, status: 400 };
  }

  if (user.is_active === 0) {
    return await handleInactiveUser(user);
  }

  if (user.is_two_fa_enabled === 1) {
    return await handleTwoFactorAuth(user);
  }

  const payload = {
    id: user.userId,
    email: user.emailAddress,
    userName: user.firstName,
    userImage: user.userImage,
  };

  const refreshToken = generateToken(payload);
  const token = generateAccessToken(payload);

  const userId = user.userId;
 
  // Check for any active session
  const activeSession = await userSession.findOne({
    where: {
      user_id: userId,
      session_status: 'active'
    }
  });

  if (activeSession) {
    // If there's an active session, end it first
    await activeSession.update({
      logout_time: new Date().toISOString(),
      session_status: 'ended'
    });
  }else{
  // Create new session
  await userSession.create({
    user_id: userId,
    login_time: loginTime || new Date().toISOString(),
    session_status: 'active'
  });
  }

  await UserMaster.update(
    { token: refreshToken, isAuthenticated: 1 },
    { where: { userId: user.userId } }
  );

  return {
    status:200,
    message:SUCCESS_MESSAGES.LOGIN_SUCCESS,
    body: {
      ...user,
      token: refreshToken,
      refreshToken: token,
      isAuthenticated: 1,
    },
  };
};

const handleInactiveUser = async (user) => {
  const emailType = 1;
  const randomOtp = await generate6DigitOTP();
  await sendOTPAsync(user.emailAddress, randomOtp, emailType);

  await UserMaster.update(
    { token: randomOtp },
    { where: { userId: user.userId } }
  );

  const payload = { id: user.userId, otp: randomOtp };
  return {
    message: SUCCESS_MESSAGES.USER_NOT_VERIFIED,
    status: 200,
    body: {
      is_active: user.is_active,
      token: generateToken(payload),
      refreshToken: generateAccessToken(payload),
    },
  };
};

export const handleTwoFactorAuth = async (user) => {
  console.log("2FA enabled");
  const emailType = 2;
  const randomOtp = await generate6DigitOTP();

  const payload = { id: user.userId };

  await sendOTPAsync(user.emailAddress, randomOtp, emailType);
  await UserMaster.update(
    { token: randomOtp },
    { where: { userId: user.userId } }
  );

  return {
    message: SUCCESS_MESSAGES.SECURITY_CODE_SENT,
    status: 200,
    body: {
      ...user,
      token: generateToken(payload),
      refreshToken: generateAccessToken(payload),
    },
  };
};

export const updateUserPassword = async (userId, oldPassword, newPassword) => {
  try {
    const DecryptOldPass = await decryptPassword(oldPassword);
    const DecryptNewPass = await decryptPassword(newPassword);

    const user = await UserMaster.findOne({ where: { userId } });
    if (!user) {
      return { status: 404, data: { message: ERROR_MESSAGES.USER_NOT_FOUND } };
    }

    const isPasswordMatch = await bcrypt.compare(DecryptOldPass, user.password);
    if (!isPasswordMatch) {
      return {
        status: 400,
        data: { message: ERROR_MESSAGES.INVALID_OLD_PASSWORD },
      };
    }

    if (DecryptOldPass === DecryptNewPass) {
      return { status: 400, data: { message: ERROR_MESSAGES.SAME_PASSWORD } };
    }

    const hashedPassword = await bcrypt.hash(DecryptNewPass, 15);
    const updatedUser = await UserMaster.update(
      { password: hashedPassword },
      { where: { userId } }
    );
    if (!updatedUser) {
      return res
        .status(400)
        .json({ message: ERROR_MESSAGES.PASSWORD_UPDATE_FAILED });
    }

    return {
      status: 200,
      data: { message: SUCCESS_MESSAGES.PASSWORD_UPDATED },
    };
  } catch (error) {
    console.error("Error in updateUserPasswordService:", error);
    return { status: 500, data: { message: ERROR_MESSAGES.INTERNAL_SERVER } };
  }
};


export default {
  signupUser,
  resetPassword,
  createPassword,
  verifyUserOTP,
  loginUser,
  resendOTP,
  updateUserPassword,
};
