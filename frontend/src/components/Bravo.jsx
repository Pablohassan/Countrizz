import React from "react";
import ricketmorty from "../assets/Images/rick-and-morty-rtj.gif";

export default function Bravo({ namePaysBravo }) {
  return (
    <div
      className="modale"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="fixed z-100000 inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />

      <div className="center z-100000 inset-0 overflow-y-auto">
        <div className="flex center items-end sm:items-center justify-center min-h-full p-4 text-center sm:p-0">
          <div className="relative bg-white center rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:max-w-lg sm:w-full">
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="namepaysbravo">
                Tu déchire!! la réponse était bien {namePaysBravo}
                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                  <img
                    className="imagebravo top-200 z-10000 absolute"
                    src={ricketmorty}
                    alt=" rick et morty bravo"
                  />
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse" />
          </div>
        </div>
      </div>
    </div>
  );
}
