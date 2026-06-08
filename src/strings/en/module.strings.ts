export const moduleStringsEn = {
  auth: {
    emailOrPasswordIncorrectError: "Email or password is incorrect",
    authThrottledTryAgainAfterMinutesError: "Your account has been locked due to too many password attempts, please try again after {{duration}} minute(s)",
    verifyPhoneNumberError: "Your phone number verification is pending",
    invalidPasswordFormatError: "Your password must contain a lowercase letter, an uppercase letter, a number and a special character and must be at least 8 characters",
    otpInvalidError: "The code is either invalid or has expired. Please request a new one",
    otpThrottledTryAgainAfterMinutesError: "The user was sent a code minutes ago, please try again after {{duration}} minute(s)",
    maxOtpAttemptsReachedError: "Maximum code attempts reached. Please request a new code",
  },
  me: {
    oldPasswordLabel: "Current Password",
    oldPasswordRequired: "Your old password is required",
    newPasswordLabel: "New Password",
    incorrectPasswordError: "Your password is incorrect",
    incorrectOldPasswordError: "Your old password is incorrect",
    newPasswordSameAsOldPasswordError: "Your new password cannot be the same as your old password",
    adminsCannotRemoveSelfError: "Admins cannot delete their own accounts, you must ask another admin to delete your account",
  },
  user: {
    userWithEmailAlreadyExistsError: "A user with the provided email already exists",
  },
  userCredentialResetLink: {
    tokenInvalidError: "The password reset link is either invalid or has expired, please request a new link",
  },
  userInvite: {
    userInviteAlreadyAcceptedError: "The user has already accepted the invite",
    userInviteThrottledTryAgainAfterMinutesError: "The user was sent an invite minutes ago, please try again after {{duration}} minutes",
    tokenInvalidError: "The invite link is either invalid or has expired, please request a new invite",
  },
  userPasswordResetLink: {
    tokenInvalidError: "The password reset link is either invalid or has expired, please request a new link",
    otpInvalidError: "The code is either invalid or has expired. Please request a new one",
    otpThrottledTryAgainAfterMinutesError: "The user was sent a code minutes ago, please try again after {{duration}} minute(s)",
    emailThrottledTryAgainAfterMinutesError: "The user was sent a link in the email minutes ago, please try again after {{duration}} minute(s)",
    maxOtpAttemptsReachedError: "Maximum code attempts reached. Please request a new code",
  },
  project: {
    projectNameUnavailableError: "This project name is unavailable. Please choose another name.",
  },
  repository: {
    repositoryAlreadyIndexedError: "This repository has already been indexed.",
  },
  document: {
    noFilesUploadedError: "No files uploaded",
  },
  mcp: {
    missingAccessTokenError: "Authentication is required. Connect via OAuth to obtain an access token.",
    missingProjectIdentifierError: "Either projectId or gitRemoteUrl must be provided.",
    projectNotFoundError: "Project not found or you do not have access to it.",
    invalidAccessTokenError: "The provided access token is invalid. Please provide a valid authentication token.",
    userNotProvisionedError: "Your user account has not been provisioned for access. Please contact an administrator.",
  },
  oauth: {
    notConfiguredError: "OAuth is not configured. Please contact your administrator.",
  },
};
