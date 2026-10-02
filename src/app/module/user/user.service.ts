import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../../lib/cloudinary";
import { AppError } from "../../utils/AppError";

const uploadProfileImage = async (buffer: Buffer, userId: string) => {
  const currentUser = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      imagePublicId: true,
      imageUrl: true,
    },
  });

  const cloudinaryResult = await new Promise<UploadApiResponse>(
    (resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "auto",
          },

          async (error, result) => {
            if (error) {
              if ((error as any).http_code === 403) {
                return reject(
                  new AppError(
                    httpStatus.FORBIDDEN,
                    "Cloudinary authentication failed. Please check your Cloudinary API credentials.",
                  ),
                );
              }
              return reject(error);
            }

            if (!result) {
              return reject(new Error("No result returned from Cloudinary"));
            }

            resolve(result);
          },
        )
        .end(buffer);
    },
  );

  const updatedUser = await prisma.user.update({
    where: {
      id: userId,
    },

    data: {
      imageUrl: cloudinaryResult.secure_url,
      imagePublicId: cloudinaryResult.public_id,
    },

    omit: {
      password: true,
    },

    include: {
      hub: true,
    },
  });

  if (currentUser?.imagePublicId && currentUser.imageUrl) {
    await cloudinary.uploader.destroy(currentUser.imagePublicId);
  }

  return updatedUser;
};

//  THE USER OWNS THIS PROFILE, THE EMAIL STAYS THE LOGIN IDENTITY
//  SO ONLY THE NAME AND THE PHONE CAN BE CHANGED HERE

const updateProfile = async (
  payload: { name: string; phone: string },
  userId: string,
) => {
  const currentUser = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      deletedAt: true,
    },
  });

  if (!currentUser || currentUser.deletedAt) {
    throw new AppError(httpStatus.NOT_FOUND, "User Not Found");
  }

  //  THE PHONE IS UNIQUE IN THE SCHEMA SO A FRIENDLY MESSAGE
  //  IS BETTER THAN A RAW PRISMA UNIQUE CONSTRAINT ERROR

  const phoneOwner = await prisma.user.findUnique({
    where: {
      phone: payload.phone,
    },
    select: {
      id: true,
    },
  });

  if (phoneOwner && phoneOwner.id !== userId) {
    throw new AppError(
      httpStatus.CONFLICT,
      "This Phone Number Is Already Used By Another Account",
    );
  }

  const updatedUser = await prisma.user.update({
    where: {
      id: userId,
    },

    data: {
      name: payload.name,
      phone: payload.phone,
    },

    omit: {
      password: true,
    },

    include: {
      hub: true,
    },
  });

  return updatedUser;
};

const deleteUserByID = async (userId: string) => {
  const userExist = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!userExist) {
    throw new AppError(httpStatus.NOT_FOUND, "User Not Found");
  }

  if (userExist.deletedAt) {
    throw new AppError(httpStatus.NOT_FOUND, "User Already Deleted");
  }

  const deletedUser = await prisma.user.update({
    where: {
      id: userExist.id,
    },

    data: {
      deletedAt: new Date(),
    },
  });

  return deletedUser;
};
export const UserServices = {
  updateProfile,
  uploadProfileImage,
  deleteUserByID,
};
